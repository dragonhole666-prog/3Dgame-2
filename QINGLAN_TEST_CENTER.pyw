from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Optional

APP_TITLE = "青嵐志 啟動 / 測試中心"
GUI_REVISION = "R26.1"
PINNED_NODE_VERSION = "24.18.0"
PINNED_WRANGLER_VERSION = "4.135.0"
NETWORK_RELEASE_PROPAGATION_TIMEOUT_SECONDS = 150
NETWORK_RELEASE_POLL_INTERVAL_SECONDS = 2.0
DEFAULT_CLOUDFLARE_ACCOUNT_ID = "b68eabd318a85801177bd94cac7d4aad"
NODE_SHA256 = {
    "x64": "0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821",
    "arm64": "f274669adb93b1fd0fbf8f21fd078609e9dcc84333d4f2718d2dde3f9a161a01",
}


DEVELOPMENT_BASELINE = "scripts/development-baseline.json"
DEVELOPMENT_REPORT = ".runtime/development-guard-latest.json"

# R26 Development Guard: these are executable project contracts, not comments.
# Rules intentionally lock behavior / architecture boundaries rather than line-by-line
# implementation so future refactors remain possible.
PROJECT_RULES = (
    {"id":"ARCH-UI-001","category":"UI Architecture","severity":"FAIL","title":"人物/行囊/地圖等面板資料只能由 panel-registry.ts 定義","detail":"顯示名稱、快捷鍵、功能選單必須共用 PANEL_DEFINITIONS；禁止重新引入舊式硬編碼面板表。"},
    {"id":"ARCH-NET-001","category":"Network Architecture","severity":"FAIL","title":"網路節奏與 AOI 參數只能由 network-policy.ts 定義","detail":"Server、Cloudflare Worker、Client connection 必須消費同一 NETWORK_POLICY。"},
    {"id":"ARCH-API-001","category":"Web3D API","severity":"FAIL","title":"3D Runtime 僅允許 Babylon.js","detail":"src/client 必須使用 @babylonjs/*；禁止出現第二套 3D scene graph 或舊 renderer source。"},
    {"id":"PERF-RENDER-001","category":"Performance","severity":"FAIL","title":"requestAnimationFrame 熱路徑禁止新增 Vector/Quaternion/Matrix","detail":"Render loop 的暫存數學物件必須預先配置並重用，避免每幀 GC。"},
    {"id":"DEP-LOCK-001","category":"Dependencies","severity":"FAIL","title":"依賴鎖檔必須可重現","detail":"首次安裝可建立 package-lock；鎖檔建立後 dependency/devDependency 必須與 lock root 同步，後續使用 npm ci。"},
    {"id":"LAUNCH-001","category":"Launcher","severity":"FAIL","title":"正式包禁止 BAT/CMD/PowerShell Launcher","detail":"所有本機、網路、Build、Test、Deploy 由 Python 直接 subprocess(shell=False) 管理。"},
    {"id":"RELEASE-001","category":"Release","severity":"FAIL","title":"Wrangler 固定版本且所有 Gate 全綠才可部署","detail":"禁止使用未固定版本 Wrangler；TypeScript/Build/Test/Local/WebSocket/Worker dry-run 任一失敗即停止。"},
    {"id":"TEST-SEMANTIC-001","category":"Tests","severity":"FAIL","title":"測試不得保留已失效的原始碼字串斷言","detail":"Guard 會先找出保證失敗的 source toContain 斷言；測試應優先驗證 Registry/Policy 的行為契約。"},
    {"id":"ASSET-001","category":"Assets","severity":"FAIL","title":"程式引用的使用者裝備資產必須實際存在","detail":"curated-equipment.ts 的 /assets/user-equipment 路徑會在發布前檢查。"},
    {"id":"BOSS-ANIM-001","category":"Web3D Animation","severity":"FAIL","title":"地圖王必須維持可驗證的多邊形部件動畫","detail":"fox / gudiao / kui 維持程序式模型；金髮女王使用可驗證 Mixamo 骨架與獨立攻擊層，禁止掛入無有效骨架/動作的靜態 Boss。"},
    {"id":"CHANGE-001","category":"Change Management","severity":"FAIL","title":"變更必須產生影響範圍並執行對應 Gate","detail":"Guard 以 baseline SHA-256 判斷修改檔案，列出受影響測試與 Runtime Gate；完整發布仍需全套 Regression。"},
)

CHANGE_IMPACT_RULES = (
    (("src/shared/data/monsters.ts", "src/client/character/monster-model.ts", "tests/babylon-monster-model.test.ts"),
     ("Babylon Verify", "Babylon Monster", "TypeScript", "Build", "Tests")),
    (("src/shared/network/", "server/index.ts", "server/world.ts", "cloudflare/world-worker/", "src/client/networking/"),
     ("network-policy", "network-interest", "command-schema", "Local WebSocket", "Worker Dry-run")),
    (("src/client/ui/", "src/styles.css", "src/client/input/"),
     ("panel-registry", "character-panel", "mobile HUD", "Build")),
    (("src/shared/data/equipment.ts", "src/shared/data/loot-tables.ts", "src/client/character/", "public/assets/user-equipment/"),
     ("domains", "weapon-skills", "character-panel", "asset integrity", "Build")),
    (("server/",), ("server regression", "Local Runtime", "Local WebSocket")),
    (("package.json", "package-lock.json"), ("Package Integrity", "npm ci", "TypeScript", "Build", "Tests")),
    (("vite.config.ts",), ("Build", "browser chunk integrity")),
    (("QINGLAN_TEST_CENTER.py", "QINGLAN_TEST_CENTER.pyw", "scripts/verify-"),
     ("GUI SELF-TEST", "Package Integrity", "Current Verify")),
)


class CancelledError(RuntimeError):
    pass


@dataclass(frozen=True)
class NodeRuntime:
    node: Path
    npm_cli: Path
    npx_cli: Path
    node_version: str
    npm_version: str
    source: str

    @property
    def node_home(self) -> Path:
        return self.node.parent


@dataclass
class RunResult:
    returncode: int
    stdout: str
    stderr: str


@dataclass
class ServiceProcess:
    name: str
    process: subprocess.Popen[str]


class ProjectConfig:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.package = self._read_json(self.root / "package.json")
        self.version = str(self.package.get("version", "0.0.0"))
        self.release = f"P{self.version}"
        self.wrangler_config = self.root / "cloudflare" / "world-worker" / "wrangler.jsonc"
        wrangler = self._read_jsonc(self.wrangler_config)
        self.worker_name = str(wrangler.get("name", "qinglan-world"))
        self.settings_path = self.root / ".runtime" / "gui-test-center.json"
        self.wrangler = wrangler

    @staticmethod
    def _read_json(path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8-sig"))

    @staticmethod
    def _read_jsonc(path: Path) -> dict:
        text = path.read_text(encoding="utf-8-sig")
        # Current wrangler file is JSON-compatible; tolerate // and /* */ comments for future edits.
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        text = re.sub(r"(^|\s)//.*?$", r"\1", text, flags=re.M)
        return json.loads(text)

    def load_settings(self) -> dict:
        if not self.settings_path.exists():
            return {}
        try:
            return self._read_json(self.settings_path)
        except Exception:
            return {}

    def save_settings(self, data: dict) -> None:
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        self.settings_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class RuntimeResolver:
    def __init__(self, project: Path, log: Callable[[str, str], None], cancel: threading.Event) -> None:
        self.project = project
        self.log = log
        self.cancel = cancel

    def resolve(self) -> NodeRuntime:
        self._check_cancel()
        for candidate, source in self._system_candidates():
            runtime = self._validate(candidate, source)
            if runtime:
                return runtime
        return self._ensure_portable()

    def _system_candidates(self) -> Iterable[tuple[Path, str]]:
        found = shutil.which("node.exe") or shutil.which("node")
        if found:
            yield Path(found), "system-path"
        if os.name == "nt":
            program_files = os.environ.get("ProgramFiles")
            if program_files:
                p = Path(program_files) / "nodejs" / "node.exe"
                if p.exists() and (not found or p.resolve() != Path(found).resolve()):
                    yield p, "system-programfiles"

    def _validate(self, node: Path, source: str) -> Optional[NodeRuntime]:
        if not node.exists():
            return None
        try:
            version = self._capture([str(node), "-p", "process.versions.node"], timeout=10).strip()
            major = int(version.split(".")[0])
            if major not in (22, 24):
                self.log("WARN", f"略過不支援的 Node.js v{version}：{node}")
                return None
            npm_cli = self._find_npm_cli(node)
            if not npm_cli:
                self.log("WARN", f"找到 Node.js v{version}，但找不到 npm-cli.js：{node}")
                return None
            npx_cli = npm_cli.with_name("npx-cli.js")
            if not npx_cli.exists():
                self.log("WARN", f"找不到 npx-cli.js：{npx_cli}")
                return None
            npm_version = self._capture([str(node), str(npm_cli), "--version"], timeout=15).strip()
            self.log("PASS", f"Node Runtime：v{version} / npm {npm_version} ({source})")
            return NodeRuntime(node.resolve(), npm_cli.resolve(), npx_cli.resolve(), version, npm_version, source)
        except Exception as exc:
            self.log("WARN", f"Node Runtime 驗證失敗：{exc}")
            return None

    def _find_npm_cli(self, node: Path) -> Optional[Path]:
        home = node.parent
        candidates = [
            home / "node_modules" / "npm" / "bin" / "npm-cli.js",
            home.parent / "lib" / "node_modules" / "npm" / "bin" / "npm-cli.js",
        ]
        appdata = os.environ.get("APPDATA")
        if appdata:
            candidates.append(Path(appdata) / "npm" / "node_modules" / "npm" / "bin" / "npm-cli.js")
        for p in candidates:
            if p.exists():
                return p
        return None

    def _ensure_portable(self) -> NodeRuntime:
        arch = self._arch()
        folder = f"node-v{PINNED_NODE_VERSION}-win-{arch}"
        runtime_root = self.project / ".runtime"
        node_home = runtime_root / folder
        node_exe = node_home / "node.exe"
        existing = self._validate(node_exe, "portable-existing")
        if existing:
            return existing

        runtime_root.mkdir(parents=True, exist_ok=True)
        cache = runtime_root / "cache"
        cache.mkdir(parents=True, exist_ok=True)
        zip_name = f"{folder}.zip"
        zip_path = cache / zip_name
        expected_sha = NODE_SHA256[arch]
        url = f"https://nodejs.org/dist/v{PINNED_NODE_VERSION}/{zip_name}"

        if not self._valid_sha(zip_path, expected_sha):
            if zip_path.exists():
                zip_path.unlink()
            self.log("INFO", f"下載官方 Portable Node.js v{PINNED_NODE_VERSION} ({arch})…")
            request = urllib.request.Request(url, headers={"User-Agent": "Qinglan-Python-Test-Center", "Cache-Control": "no-cache", "Pragma": "no-cache"})
            try:
                with urllib.request.urlopen(request, timeout=30) as response, zip_path.open("wb") as fh:
                    while True:
                        self._check_cancel()
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        fh.write(chunk)
            except Exception:
                if zip_path.exists():
                    zip_path.unlink()
                raise
            if not self._valid_sha(zip_path, expected_sha):
                zip_path.unlink(missing_ok=True)
                raise RuntimeError("Portable Node ZIP SHA-256 不符，已拒絕執行。")

        self.log("INFO", "解壓 Portable Node.js…")
        if node_home.exists():
            shutil.rmtree(node_home)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(runtime_root)
        runtime = self._validate(node_exe, "portable-downloaded")
        if not runtime:
            raise RuntimeError("Portable Node 解壓完成，但 Node/npm 無法使用。")
        return runtime

    @staticmethod
    def _arch() -> str:
        machine = platform.machine().lower()
        if machine in {"amd64", "x86_64", "x64"}:
            return "x64"
        if machine in {"arm64", "aarch64"}:
            return "arm64"
        raise RuntimeError(f"不支援的 Windows CPU 架構：{machine}")

    @staticmethod
    def _valid_sha(path: Path, expected: str) -> bool:
        if not path.exists():
            return False
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest().lower() == expected.lower()

    def _capture(self, command: list[str], timeout: int) -> str:
        self._check_cancel()
        flags = 0
        if os.name == "nt":
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        cp = subprocess.run(
            command,
            cwd=self.project,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            shell=False,
            creationflags=flags,
        )
        if cp.returncode != 0:
            raise RuntimeError((cp.stderr or cp.stdout).strip() or f"exit={cp.returncode}")
        return cp.stdout

    def _check_cancel(self) -> None:
        if self.cancel.is_set():
            raise CancelledError("使用者已取消目前工作。")


class ProcessRunner:
    def __init__(self, root: Path, log: Callable[[str, str], None], cancel: threading.Event) -> None:
        self.root = root
        self.log = log
        self.cancel = cancel
        self.current: Optional[subprocess.Popen[str]] = None
        self.services: dict[str, ServiceProcess] = {}
        self._lock = threading.Lock()

    def run(self, command: list[str], *, env: Optional[dict[str, str]] = None, timeout: Optional[int] = None, label: str = "") -> RunResult:
        self._assert_direct(command)
        self._check_cancel()
        if label:
            self.log("INFO", f"執行：{label}")
        self.log("CMD", self._display(command))
        full_env = os.environ.copy()
        full_env.update({"NO_COLOR": "1", "FORCE_COLOR": "0"})
        if env:
            full_env.update(env)
        popen_kwargs = self._popen_kwargs()
        process = subprocess.Popen(
            command,
            cwd=self.root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=full_env,
            shell=False,
            **popen_kwargs,
        )
        with self._lock:
            self.current = process
        out: list[str] = []
        err: list[str] = []
        threads = [
            threading.Thread(target=self._drain, args=(process.stdout, out, "OUT"), daemon=True),
            threading.Thread(target=self._drain, args=(process.stderr, err, "ERR"), daemon=True),
        ]
        for thread in threads:
            thread.start()
        started = time.monotonic()
        try:
            while process.poll() is None:
                if self.cancel.is_set():
                    self.terminate_process(process)
                    raise CancelledError("使用者已取消目前工作。")
                if timeout is not None and time.monotonic() - started > timeout:
                    self.terminate_process(process)
                    raise RuntimeError(f"{label or '程序'} 執行逾時。")
                time.sleep(0.10)
            for thread in threads:
                thread.join(timeout=1.0)
            return RunResult(process.returncode or 0, "".join(out), "".join(err))
        finally:
            with self._lock:
                if self.current is process:
                    self.current = None

    def start_service(self, name: str, command: list[str], *, env: Optional[dict[str, str]] = None) -> ServiceProcess:
        self._assert_direct(command)
        self._check_cancel()
        if name in self.services:
            self.stop_service(name)
        self.log("INFO", f"啟動 {name}")
        self.log("CMD", self._display(command))
        full_env = os.environ.copy()
        full_env.update({"NO_COLOR": "1", "FORCE_COLOR": "0"})
        if env:
            full_env.update(env)
        process = subprocess.Popen(
            command,
            cwd=self.root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=full_env,
            shell=False,
            **self._popen_kwargs(),
        )
        svc = ServiceProcess(name, process)
        self.services[name] = svc
        threading.Thread(target=self._drain, args=(process.stdout, [], f"{name}:OUT"), daemon=True).start()
        threading.Thread(target=self._drain, args=(process.stderr, [], f"{name}:ERR"), daemon=True).start()
        return svc

    def stop_service(self, name: str) -> None:
        svc = self.services.pop(name, None)
        if svc:
            self.terminate_process(svc.process)
            self.log("INFO", f"已停止 {name}")

    def stop_all_services(self) -> None:
        for name in list(self.services):
            self.stop_service(name)

    def cancel_current(self) -> None:
        with self._lock:
            current = self.current
        if current and current.poll() is None:
            self.terminate_process(current)

    def terminate_process(self, process: subprocess.Popen[str]) -> None:
        if process.poll() is not None:
            return
        try:
            if os.name == "nt":
                flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
                subprocess.run(
                    ["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    shell=False,
                    creationflags=flags,
                    timeout=10,
                )
                # taskkill /T terminates Vite's esbuild child as well. Wait for the
                # parent handle to become signalled before npm ci is allowed to mutate
                # node_modules; otherwise Windows can keep esbuild.exe locked briefly.
                try:
                    process.wait(timeout=6)
                except subprocess.TimeoutExpired:
                    process.kill()
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        pass
            else:
                process.terminate()
                try:
                    process.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    process.kill()
                    try:
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        pass
        except Exception:
            try:
                process.kill()
                process.wait(timeout=2)
            except Exception:
                pass

    def _drain(self, stream, sink: list[str], channel: str) -> None:
        if stream is None:
            return
        try:
            for line in iter(stream.readline, ""):
                sink.append(line)
                self.log(channel, line.rstrip("\r\n"))
        finally:
            try:
                stream.close()
            except Exception:
                pass

    @staticmethod
    def _display(command: list[str]) -> str:
        def q(value: str) -> str:
            return f'"{value}"' if any(ch.isspace() for ch in value) else value
        return " ".join(q(str(x)) for x in command)

    @staticmethod
    def _assert_direct(command: list[str]) -> None:
        if not command:
            raise RuntimeError("空白命令。")
        first = Path(str(command[0])).name.lower()
        if first in {"cmd.exe", "cmd"} or first.endswith((".bat", ".cmd")):
            raise RuntimeError("GUI 禁止透過命令殼層或批次檔啟動工作。")

    @staticmethod
    def _popen_kwargs() -> dict:
        if os.name == "nt":
            return {
                "creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0)
                | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            }
        return {"start_new_session": True}

    def _check_cancel(self) -> None:
        if self.cancel.is_set():
            raise CancelledError("使用者已取消目前工作。")


@dataclass(frozen=True)
class GuardFinding:
    rule_id: str
    severity: str
    ok: bool
    message: str


class DevelopmentGuard:
    """Static architecture + change-impact guard embedded in the Python launcher.

    It deliberately avoids interpreting implementation details too narrowly. The goal is
    to preserve source-of-truth boundaries and release invariants while allowing future
    refactors behind those contracts.
    """

    SOURCE_SUFFIXES = {".py", ".pyw", ".ts", ".tsx", ".js", ".mjs", ".json", ".jsonc", ".css", ".html"}
    EXCLUDED_PARTS = {"node_modules", "dist", ".runtime", "logs", ".git", "data"}

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.baseline_path = self.root / DEVELOPMENT_BASELINE
        self.report_path = self.root / DEVELOPMENT_REPORT

    @staticmethod
    def rule_rows() -> tuple[dict, ...]:
        return PROJECT_RULES

    def run(self) -> dict:
        findings: list[GuardFinding] = []
        add = findings.append

        panel = self._read("src/client/ui/panel-registry.ts")
        ui = self._read("src/client/ui/game-ui.ts")
        game = self._read("src/client/core/game.ts")
        network = self._read("src/shared/network/network-policy.ts")
        server = self._read("server/index.ts")
        worker = self._read("cloudflare/world-worker/src/index.js")
        connection = self._read("src/client/networking/connection.ts")
        curated = self._read("src/client/character/curated-equipment.ts")
        monsters = self._read("src/shared/data/monsters.ts")
        monster_model = self._read("src/client/character/monster-model.ts")

        ui_ok = all((
            "PANEL_DEFINITIONS" in panel,
            "panelForHotkey" in panel,
            "PANEL_DEFINITIONS" in ui,
            "FUNCTION_PANEL_IDS" in ui,
            "panelForHotkey" in game,
            "['equipment','person','人物','C']" not in ui,
        ))
        add(GuardFinding("ARCH-UI-001", "FAIL", ui_ok, "panel-registry 為 UI metadata 單一來源" if ui_ok else "UI 面板 metadata 出現舊硬編碼或未使用 panel-registry"))

        network_contracts = {
            "shared policy": "NETWORK_POLICY" in network and "NETWORK_SNAPSHOT_SCOPE" in network,
            "server consumer": "network-policy" in server and "NETWORK_POLICY" in server,
            "worker consumer": "network-policy" in worker and "NETWORK_POLICY" in worker,
            "client reconnect consumer": "network-policy" in connection and "reconnectDelayMs" in connection,
        }
        duplicate_symbols = self._find_network_policy_duplicates()
        missing_network_contracts = [name for name, ok in network_contracts.items() if not ok]
        net_ok = not missing_network_contracts and not duplicate_symbols
        if net_ok:
            detail = "network-policy 為 Server/Worker/Client 共用單一來源"
        else:
            issues = [*(f"缺少 {name}" for name in missing_network_contracts), *(f"重複 {item}" for item in duplicate_symbols[:6])]
            detail = "網路策略檢核失敗：" + ", ".join(issues)
        add(GuardFinding("ARCH-NET-001", "FAIL", net_ok, detail))

        babylon_only = "@babylonjs/core" in game and not (self.root / "src" / "legacy-three").exists()
        add(GuardFinding("ARCH-API-001", "FAIL", babylon_only, "Babylon.js 為唯一 3D runtime，舊 renderer source 不存在" if babylon_only else "Babylon.js 單一引擎邊界遭破壞"))

        render_allocations = self._render_loop_allocations()
        add(GuardFinding("PERF-RENDER-001", "FAIL", not render_allocations, "requestAnimationFrame 熱路徑未發現數學物件配置" if not render_allocations else "Render loop 疑似每幀配置：" + ", ".join(render_allocations[:6])))

        lock_ok, lock_detail = self._dependency_lock_contract()
        add(GuardFinding("DEP-LOCK-001", "FAIL", lock_ok, lock_detail))

        shell_files = [str(p.relative_to(self.root)).replace("\\", "/") for p in self.root.rglob("*") if p.is_file() and p.suffix.lower() in {".bat", ".cmd", ".ps1"} and not self._excluded(p)]
        add(GuardFinding("LAUNCH-001", "FAIL", not shell_files, "正式專案沒有 BAT/CMD/PowerShell launcher" if not shell_files else "禁止的 shell launcher：" + ", ".join(shell_files[:8])))

        wrangler_latest = self._grep_sources(("wrangler@" + "latest",), include_python=True)
        release_ok = not wrangler_latest and PINNED_WRANGLER_VERSION in self._read("QINGLAN_TEST_CENTER.py") and "_full_release_gate" in self._read("QINGLAN_TEST_CENTER.py")
        add(GuardFinding("RELEASE-001", "FAIL", release_ok, f"Wrangler 固定 {PINNED_WRANGLER_VERSION} 且 Release Gate 由 Python 管理" if release_ok else "發布流程存在未固定版 Wrangler 或缺少固定版 Gate"))

        stale_assertions = self._stale_source_assertions()
        add(GuardFinding("TEST-SEMANTIC-001", "FAIL", not stale_assertions, "未發現保證失敗的 source toContain 舊斷言" if not stale_assertions else "發現已失效 source assertion：" + ", ".join(stale_assertions[:6])))

        missing_assets = []
        for rel in re.findall(r"url:\s*['\"](/assets/user-equipment/[^'\"]+)['\"]", curated):
            target = self.root / "public" / rel.lstrip("/")
            if not target.is_file() or target.stat().st_size == 0:
                missing_assets.append(rel)
        add(GuardFinding("ASSET-001", "FAIL", not missing_assets, "curated user-equipment 資產引用完整" if not missing_assets else "缺少資產：" + ", ".join(missing_assets)))

        deleted_boss_ids=("green-wraith","wasteland-swordsman","ruin-chieftain")
        boss_contracts = {
            "fox/gudiao/kui boss data": all(token in monsters for token in ("fox:{","gudiao:{","kui:{")),
            "golden queen behavior": "'golden-queen':" in monsters and "bossBehavior:'queen-duelist'" in monsters,
            "removed legacy boss ids": all(boss_id not in monsters for boss_id in deleted_boss_ids),
            "Babylon monster GLB loader": "SceneLoader.ImportMeshAsync" in monster_model,
            "skeleton-first scale calibration": "measureHumanoidSkeletonFrame(holder)??measureMeshBounds" in monster_model,
            "golden queen GLB": (self.root / "public" / "assets" / "bosses" / "golden_queen.glb").is_file(),
            "Mixamo Walking asset": (self.root / "public" / "assets" / "animations" / "mixamo" / "Walking.glb").is_file(),
            "Mixamo Fast_Run asset": (self.root / "public" / "assets" / "animations" / "mixamo" / "Fast_Run.glb").is_file(),
            "no deprecated user-monsters folder": not (self.root / "public" / "assets" / "user-monsters").exists(),
            "Babylon monster regression": (self.root / "tests" / "babylon-monster-model.test.ts").is_file(),
            "Babylon verifier": (self.root / "scripts" / "verify-babylon-runtime.mjs").is_file(),
            "Babylon character regression": (self.root / "tests" / "babylon-character-runtime.test.ts").is_file(),
            "Babylon LookDev regression": (self.root / "tests" / "babylon-lookdev.test.ts").is_file(),
        }
        missing_boss_contracts = [name for name, ok in boss_contracts.items() if not ok]
        procedural_boss_ok = not missing_boss_contracts
        boss_detail = (
            "Babylon 怪物 GLB / skeleton scale / 金髮女王資產 / character + LookDev regression gate"
            if procedural_boss_ok else "地圖王/動畫 regression 缺少：" + ", ".join(missing_boss_contracts)
        )
        add(GuardFinding("BOSS-ANIM-001", "FAIL", procedural_boss_ok, boss_detail))

        manifest = self.current_manifest()
        baseline = self.load_baseline()
        changed = self.diff_manifest(baseline.get("files", {}) if baseline else {}, manifest) if baseline else []
        impacts = self.impact_for(changed)
        baseline_ok = baseline is not None
        add(GuardFinding("CHANGE-001", "FAIL", baseline_ok, (f"baseline 已載入；偵測 {len(changed)} 個變更，影響：{', '.join(impacts) if impacts else '無額外專項'}" if baseline_ok else "缺少 development baseline；禁止正式發布")))

        failed = [f for f in findings if f.severity == "FAIL" and not f.ok]
        report = {
            "schema": 1,
            "release": self._package_version(),
            "passed": not failed,
            "findings": [f.__dict__ for f in findings],
            "changed_files": changed,
            "required_checks": impacts,
        }
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        self.report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return report

    def write_baseline(self) -> None:
        data = {
            "schema": 1,
            "release": self._package_version(),
            "files": self.current_manifest(),
        }
        self.baseline_path.parent.mkdir(parents=True, exist_ok=True)
        self.baseline_path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")

    def load_baseline(self) -> dict:
        if not self.baseline_path.is_file():
            return {}
        try:
            data = json.loads(self.baseline_path.read_text(encoding="utf-8-sig"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def current_manifest(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for path in self.root.rglob("*"):
            if not path.is_file() or self._excluded(path):
                continue
            rel = str(path.relative_to(self.root)).replace("\\", "/")
            if rel == DEVELOPMENT_BASELINE or rel == DEVELOPMENT_REPORT:
                continue
            include = path.suffix.lower() in self.SOURCE_SUFFIXES
            include = include or rel.startswith("public/assets/user-equipment/")
            if not include:
                continue
            h = hashlib.sha256()
            with path.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                    h.update(chunk)
            out[rel] = h.hexdigest()
        return dict(sorted(out.items()))

    @staticmethod
    def diff_manifest(baseline: dict[str, str], current: dict[str, str]) -> list[str]:
        names = set(baseline) | set(current)
        return sorted(name for name in names if baseline.get(name) != current.get(name))

    @staticmethod
    def impact_for(changed: list[str]) -> list[str]:
        impacts: list[str] = []
        for prefixes, checks in CHANGE_IMPACT_RULES:
            if any(any(name == prefix or name.startswith(prefix) for prefix in prefixes) for name in changed):
                for check in checks:
                    if check not in impacts:
                        impacts.append(check)
        return impacts

    def _dependency_lock_contract(self) -> tuple[bool, str]:
        try:
            pkg = json.loads(self._read("package.json"))
            lock_path = self.root / "package-lock.json"
            if not lock_path.is_file():
                return True, "package-lock 尚未建立；首次 npm install 將建立並於正式發布前提交"
            lock = json.loads(lock_path.read_text(encoding="utf-8-sig"))
            root = (lock.get("packages") or {}).get("") or {}
            if lock.get("version") != pkg.get("version") or root.get("version") != pkg.get("version"):
                return False, "package/package-lock 版本不一致"
            for section in ("dependencies", "devDependencies", "optionalDependencies"):
                if (pkg.get(section) or {}) != (root.get(section) or {}):
                    return False, f"{section} 與 lock root 不一致"
            return True, "package.json 與 package-lock root 完全同步"
        except Exception as exc:
            return False, f"無法解析 package/lock：{exc}"

    def _find_network_policy_duplicates(self) -> list[str]:
        forbidden = ("SNAPSHOT_HZ", "SNAPSHOT_INTERVAL_MS", "RECONNECT_BASE_MS", "PLAYER_INTEREST_RADIUS", "MONSTER_INTEREST_RADIUS", "SOFT_BUFFERED_BYTES", "HARD_BUFFERED_BYTES")
        found: list[str] = []
        for path in self._source_files():
            rel = str(path.relative_to(self.root)).replace("\\", "/")
            if rel == "src/shared/network/network-policy.ts":
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            for symbol in forbidden:
                if re.search(rf"\b(?:const|let|var)\s+{re.escape(symbol)}\b", text):
                    found.append(f"{rel}:{symbol}")
        return found

    def _render_loop_allocations(self) -> list[str]:
        findings: list[str] = []
        allocation = re.compile(r"\bnew\s+(?:T\.)?(?:Vector[234]|Quaternion|Matrix[34]|Euler|Color)\s*\(")
        for path in self._source_files():
            text = path.read_text(encoding="utf-8", errors="replace")
            lines = text.splitlines()
            for index, line in enumerate(lines):
                if "requestAnimationFrame" not in line:
                    continue
                start = max(0, index - 2); end = min(len(lines), index + 28)
                for offset, candidate in enumerate(lines[start:end], start + 1):
                    if allocation.search(candidate):
                        rel = str(path.relative_to(self.root)).replace("\\", "/")
                        findings.append(f"{rel}:{offset}")
        return findings

    def _stale_source_assertions(self) -> list[str]:
        stale: list[str] = []
        for test in (self.root / "tests").glob("*.test.ts"):
            text = test.read_text(encoding="utf-8", errors="replace")
            bindings: dict[str, str] = {}
            for name, source in re.findall(r"const\s+(\w+)\s*=\s*read\(['\"]([^'\"]+)['\"]\)", text):
                bindings[name] = source
            for name, source in re.findall(r"const\s+(\w+)\s*=\s*fs\.readFileSync\(path\.join\(root,['\"]([^'\"]+)['\"]\),['\"]utf8['\"]\)", text):
                bindings[name] = source
            for var, source in bindings.items():
                target = self.root / source
                if not target.is_file():
                    continue
                actual = target.read_text(encoding="utf-8", errors="replace")
                pattern = re.compile(rf"expect\({re.escape(var)}\)\.toContain\((['\"])(.*?)\1\)")
                for match in pattern.finditer(text):
                    literal = match.group(2)
                    # Source assertions are JS/TS string literals. Decode the common
                    # quote/backslash escapes before comparing them with source text;
                    # otherwise valid assertions such as enterkeyhint=\"done\" are
                    # falsely reported as stale by TEST-SEMANTIC-001.
                    literal = (literal
                        .replace(r"\\\\", "\0")
                        .replace(r"\\\"", '"')
                        .replace(r"\\'", "'")
                        .replace(r"\\n", "\n")
                        .replace(r"\\r", "\r")
                        .replace(r"\\t", "\t")
                        .replace("\0", "\\"))
                    if literal not in actual:
                        stale.append(f"{test.name}->{source}:{literal[:36]}")
        return stale

    def _grep_sources(self, patterns: tuple[str, ...], include_python: bool = False) -> list[str]:
        compiled = [re.compile(p) for p in patterns]
        found: list[str] = []
        for path in self._source_files(include_python=include_python):
            text = path.read_text(encoding="utf-8", errors="replace")
            if any(regex.search(text) for regex in compiled):
                found.append(str(path.relative_to(self.root)).replace("\\", "/"))
        return found

    def _source_files(self, include_python: bool = False):
        suffixes = {".ts", ".tsx", ".js", ".mjs"}
        if include_python:
            suffixes |= {".py", ".pyw"}
        for path in self.root.rglob("*"):
            if path.is_file() and path.suffix.lower() in suffixes and not self._excluded(path):
                yield path

    def _excluded(self, path: Path) -> bool:
        try:
            rel = path.relative_to(self.root)
        except ValueError:
            return True
        return any(part in self.EXCLUDED_PARTS for part in rel.parts)

    def _read(self, relative: str) -> str:
        path = self.root / relative
        return path.read_text(encoding="utf-8-sig", errors="replace") if path.is_file() else ""

    def _package_version(self) -> str:
        try:
            return str(json.loads(self._read("package.json")).get("version", "0.0.0"))
        except Exception:
            return "0.0.0"


class QinglanController:
    def __init__(self, config: ProjectConfig, emit: Callable[[tuple], None]) -> None:
        self.config = config
        self.emit = emit
        self.cancel_event = threading.Event()
        self.runtime: Optional[NodeRuntime] = None
        self.runner = ProcessRunner(config.root, self.log, self.cancel_event)
        self.current_job: Optional[threading.Thread] = None
        self.local_ready = False
        self.development_guard = DevelopmentGuard(config.root)

    def log(self, level: str, text: str) -> None:
        if text:
            self.emit(("log", level, text))

    def set_step(self, name: str, status: str, detail: str = "") -> None:
        self.emit(("step", name, status, detail))

    def run_development_guard(self) -> dict:
        self.set_step("Development Guard", "RUNNING", "Architecture / Dependency / Test contracts")
        report = self.development_guard.run()
        for finding in report["findings"]:
            level = "PASS" if finding["ok"] else finding["severity"]
            self.log(level, f"{finding['rule_id']} · {finding['message']}")
        changed = report.get("changed_files", [])
        impacts = report.get("required_checks", [])
        if changed:
            preview = ", ".join(changed[:8]) + (f" … +{len(changed)-8}" if len(changed) > 8 else "")
            detail = f"{len(changed)} files · {preview}"
        else:
            detail = "與開發 baseline 一致"
        self.set_step("Change Impact", "PASS", detail + (f" · required: {', '.join(impacts)}" if impacts else ""))
        if not report.get("passed"):
            failed = [f["rule_id"] for f in report["findings"] if not f["ok"] and f["severity"] == "FAIL"]
            self.set_step("Development Guard", "FAIL", ", ".join(failed))
            raise RuntimeError("Development Guard 失敗：" + ", ".join(failed))
        self.set_step("Development Guard", "PASS", f"{len(report['findings'])} rules")
        return report

    def development_guard_only(self) -> None:
        self.run_development_guard()
        self.log("PASS", "開發規則檢查完成。")

    def accept_development_baseline(self, reason: str) -> None:
        self.development_guard.write_baseline()
        self.log("PASS", f"Development baseline 已更新：{reason}")

    def launch_job(self, name: str, target: Callable[[], None]) -> None:
        if self.current_job and self.current_job.is_alive():
            self.emit(("dialog", "warning", "工作進行中", "目前已有工作正在執行，請先完成或取消。"))
            return
        self.cancel_event.clear()
        self.emit(("busy", True, name))

        def worker() -> None:
            try:
                target()
                self.emit(("done", True, name))
            except CancelledError as exc:
                self.log("WARN", str(exc))
                self.emit(("done", False, f"{name}：已取消"))
            except Exception as exc:
                self.log("FAIL", str(exc))
                self.emit(("dialog", "error", f"{name}失敗", str(exc)))
                self.emit(("done", False, name))
            finally:
                self.emit(("busy", False, ""))

        self.current_job = threading.Thread(target=worker, daemon=True)
        self.current_job.start()

    def cancel(self) -> None:
        self.cancel_event.set()
        self.runner.cancel_current()
        self.log("WARN", "已送出取消要求。")

    def stop_local(self) -> None:
        self.runner.stop_all_services()
        self.local_ready = False
        self.emit(("local_ready", False))

    def _quiesce_for_dependency_mutation(self, reason: str) -> None:
        """Release every project-owned Node/esbuild handle before npm ci.

        A successful local test intentionally leaves Vite + backend running. On Windows,
        Vite also owns an esbuild.exe child. npm ci must never run while those processes
        are alive because it starts by replacing node_modules and Windows will reject
        unlinking the in-use esbuild binary with EPERM.
        """
        if self.runner.services or self.local_ready:
            self.log("INFO", f"{reason} 前自動停止本機 Frontend / Backend，釋放 node_modules 檔案鎖。")
        self.stop_local()
        # taskkill /T is synchronous enough for the process tree, but Windows/AV can
        # retain a file handle for a short moment after process exit. Give it a bounded
        # grace period, then clear only a positively identified stale Qinglan service.
        time.sleep(0.45)
        self._clear_known_stale_ports()
        time.sleep(0.25)

    def local_test(self, open_browser: bool) -> None:
        self.run_development_guard()
        self._prepare_runtime()
        self._step_node_script("Package Integrity", "scripts/verify-package-integrity.mjs")
        self._ensure_dependencies(force=False)
        self._toolchain_self_test()
        self._step_node_script("Release Sync", "scripts/sync-runtime-release.mjs")
        self._step_node_script("Current Verify", "scripts/verify-current.mjs")
        self._step_node_script("Babylon Verify", "scripts/verify-babylon-runtime.mjs")
        self._typecheck()
        self._procedural_boss_tests()
        self._start_and_verify_local(leave_running=True)
        self.local_ready = True
        self.emit(("local_ready", True))
        if open_browser:
            webbrowser.open(f"http://127.0.0.1:5173/?release={self.config.release}")
        self.log("PASS", f"本機啟動測試完成：{self.config.release}")

    def network_test(self, open_browser: bool) -> None:
        """Fully automatic production-network verification.

        If the currently packaged source fingerprint already matches the last successfully
        deployed build, verify that deployment in-place. Otherwise run the complete release
        gate, deploy the current build, discover the URL from Wrangler/config automatically,
        then verify HTTPS health + WebSocket. No manual URL entry is used.
        """
        self.run_development_guard()
        self._prepare_runtime()
        self._step_node_script("Package Integrity", "scripts/verify-package-integrity.mjs")
        fingerprint = self._deployment_fingerprint()
        settings = self.config.load_settings()
        cached = str(settings.get("network_url", "")).strip()
        cached_fp = str(settings.get("deploy_fingerprint", "")).strip()

        if cached and cached_fp == fingerprint:
            self.set_step("Network Endpoint", "PASS", f"沿用已驗證部署：{cached}")
            self.log("INFO", f"目前程式與上次部署指紋一致，直接驗證既有網路版本：{cached}")
            try:
                self._remote_health(cached)
                self._remote_websocket(cached)
                self.emit(("network_url", cached))
                if open_browser:
                    webbrowser.open(cached)
                self.log("PASS", f"網路啟動測試完成：{cached}")
                return
            except Exception as exc:
                self.log("WARN", f"既有端點驗證失敗，改為自動重新部署目前版本：{exc}")

        reason = "尚無部署紀錄" if not cached else "目前程式已變更"
        self.set_step("Network Endpoint", "RUNNING", f"{reason}，自動執行完整 Gate + Cloudflare Deploy")
        deployed_url = self._full_release_gate(deploy=True, development_guard_done=True)
        target = self._resolve_production_endpoint(deployed_url)
        self._remote_health(target)
        self._remote_websocket(target)
        self._save_deployment(target, self._deployment_fingerprint())
        self.accept_development_baseline("網路部署與驗證 PASS")
        self.emit(("network_url", target))
        self.set_step("Network Endpoint", "PASS", target)
        if open_browser:
            webbrowser.open(target)
        self.log("PASS", f"網路啟動測試完成：{target}")

    def release_preflight(self) -> None:
        self._full_release_gate(deploy=False)
        self.accept_development_baseline("完整發布預檢 PASS")
        self.log("PASS", "完整發布預檢 PASS；Development baseline 已更新，尚未執行正式 Cloudflare 部署。")

    def deploy_and_verify(self, open_browser: bool) -> None:
        deployed_url = self._full_release_gate(deploy=True)
        target = self._resolve_production_endpoint(deployed_url)
        self._remote_health(target)
        self._remote_websocket(target)
        self._save_deployment(target, self._deployment_fingerprint())
        self.accept_development_baseline("正式部署與網路驗證 PASS")
        self.emit(("network_url", target))
        self.set_step("Network Endpoint", "PASS", target)
        if open_browser:
            webbrowser.open(target)
        self.log("PASS", f"RELEASE COMPLETE：{target}")

    def _prepare_runtime(self) -> NodeRuntime:
        self.set_step("Node Runtime", "RUNNING", "偵測 Node.js / npm")
        self.runtime = RuntimeResolver(self.config.root, self.log, self.cancel_event).resolve()
        env = os.environ.copy()
        env["PATH"] = str(self.runtime.node_home) + os.pathsep + env.get("PATH", "")
        os.environ["PATH"] = env["PATH"]
        self.set_step("Node Runtime", "PASS", f"Node {self.runtime.node_version} / npm {self.runtime.npm_version}")
        return self.runtime

    def _step_node_script(self, step: str, relative: str, *args: str) -> None:
        runtime = self._require_runtime()
        self.set_step(step, "RUNNING", relative)
        path = self.config.root / relative
        if not path.exists():
            self.set_step(step, "FAIL", f"缺少 {relative}")
            raise RuntimeError(f"缺少必要檔案：{relative}")
        result = self.runner.run([str(runtime.node), str(path), *args], label=step)
        if result.returncode != 0:
            self.set_step(step, "FAIL", f"exit={result.returncode}")
            raise RuntimeError(f"{step} 失敗 (exit={result.returncode})")
        self.set_step(step, "PASS", "完成")

    def _ensure_dependencies(self, force: bool) -> None:
        runtime = self._require_runtime()
        required = [
            self.config.root / "node_modules" / "vite" / "bin" / "vite.js",
            self.config.root / "node_modules" / "tsx" / "dist" / "cli.mjs",
            self.config.root / "node_modules" / "vitest" / "vitest.mjs",
            self.config.root / "node_modules" / "@babylonjs" / "core" / "package.json",
        ]
        missing = [p for p in required if not p.exists()]
        if not force and not missing:
            self.set_step("Dependencies", "PASS", "node_modules 已完整")
            return

        # Dependency mutation must never run while the GUI-owned Vite/backend tree is alive.
        # A migrated source package may intentionally omit a stale lockfile; bootstrap it once with
        # npm install, then all later runs use npm ci for reproducibility.
        lock_exists = (self.config.root / "package-lock.json").is_file()
        npm_mode = "ci" if lock_exists else "install"
        self._quiesce_for_dependency_mutation(f"npm {npm_mode}")
        detail = f"npm {npm_mode}（{'乾淨重建' if force and lock_exists else '建立/補齊依賴'}）"
        self.set_step("Dependencies", "RUNNING", detail)
        command = [str(runtime.node), str(runtime.npm_cli), npm_mode, "--no-audit", "--no-fund"]

        def install_once(label: str) -> RunResult:
            return self.runner.run(command, label=label, timeout=600)

        result = install_once(f"npm {npm_mode}")
        combined = (result.stdout + "\n" + result.stderr).lower()
        # Defender/indexers or a just-terminated esbuild service can retain a Windows
        # executable handle for a fraction of a second. Retry once only for this exact
        # file-lock class; dependency/lockfile errors are never hidden by a retry.
        if result.returncode != 0 and os.name == "nt" and "eperm" in combined and "esbuild" in combined:
            self.log("WARN", "偵測到 esbuild.exe 暫時被 Windows 鎖定；重新確認本機服務已停止後自動重試一次。")
            self._quiesce_for_dependency_mutation(f"npm {npm_mode} 重試")
            time.sleep(1.0)
            result = install_once(f"npm {npm_mode}（EPERM 自動重試）")

        if result.returncode != 0:
            self.set_step("Dependencies", "FAIL", f"exit={result.returncode}")
            combined = (result.stdout + "\n" + result.stderr).lower()
            if "eperm" in combined:
                raise RuntimeError(f"npm {npm_mode} 遭 Windows 檔案鎖阻擋；GUI 已停止自己管理的服務，但仍有外部程序或防毒軟體占用專案檔案。")
            raise RuntimeError(f"npm {npm_mode} 失敗；package.json / package-lock.json 或網路依賴仍有問題。")
        self.set_step("Dependencies", "PASS", f"npm {npm_mode} 完成")

    def _toolchain_self_test(self) -> None:
        runtime = self._require_runtime()
        self.set_step("Toolchain", "RUNNING", "esbuild / tsx / vite")
        code = (
            "require('esbuild').transformSync('const qinglan=1');"
            "Promise.all([import('tsx'),import('vite')])"
            ".then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"
        )
        result = self.runner.run([str(runtime.node), "-e", code], label="Node toolchain self-test", timeout=60)
        if result.returncode != 0:
            self.log("WARN", "Toolchain 自我測試失敗，嘗試 npm rebuild esbuild。")
            rebuild = self.runner.run(
                [str(runtime.node), str(runtime.npm_cli), "rebuild", "esbuild"],
                label="npm rebuild esbuild",
                timeout=180,
            )
            if rebuild.returncode != 0:
                self.set_step("Toolchain", "FAIL", "esbuild rebuild 失敗")
                raise RuntimeError("Node toolchain 無法修復。")
            result = self.runner.run([str(runtime.node), "-e", code], label="Node toolchain re-test", timeout=60)
        if result.returncode != 0:
            self.set_step("Toolchain", "FAIL", "自我測試失敗")
            raise RuntimeError("Node toolchain 自我測試失敗。")
        self.set_step("Toolchain", "PASS", "esbuild / tsx / vite 正常")

    def _typecheck(self) -> None:
        runtime = self._require_runtime()
        self.set_step("TypeScript", "RUNNING", "tsc --noEmit")
        tsc = self.config.root / "node_modules" / "typescript" / "bin" / "tsc"
        result = self.runner.run([str(runtime.node), str(tsc), "--noEmit"], label="TypeScript no-emit", timeout=300)
        if result.returncode != 0:
            self.set_step("TypeScript", "FAIL", f"exit={result.returncode}")
            raise RuntimeError("TypeScript 檢查失敗。")
        self.set_step("TypeScript", "PASS", "tsc --noEmit")

    def _build(self) -> None:
        runtime = self._require_runtime()
        self.set_step("Build", "RUNNING", "Vite production build")
        vite = self.config.root / "node_modules" / "vite" / "bin" / "vite.js"
        result = self.runner.run([str(runtime.node), str(vite), "build"], label="Vite build", timeout=600)
        if result.returncode != 0 or not (self.config.root / "dist" / "index.html").exists():
            self.set_step("Build", "FAIL", f"exit={result.returncode}")
            raise RuntimeError("Production build 失敗或 dist/index.html 不存在。")
        self.set_step("Build", "PASS", "dist/index.html 已產生")

    def _tests(self) -> None:
        runtime = self._require_runtime()
        self.set_step("Tests", "RUNNING", "Vitest 全套")
        vitest = self.config.root / "node_modules" / "vitest" / "vitest.mjs"
        result = self.runner.run([str(runtime.node), str(vitest), "run"], env={"CI": "1"}, label="Vitest", timeout=900)
        if result.returncode != 0:
            self.set_step("Tests", "FAIL", f"exit={result.returncode}")
            raise RuntimeError("Vitest 有失敗測試；已停止發布流程。")
        self.set_step("Tests", "PASS", "全部測試通過")

    def _procedural_boss_tests(self) -> None:
        runtime = self._require_runtime()
        self.set_step("Boss Motion", "RUNNING", "Babylon monster GLB / scale regression")
        vitest = self.config.root / "node_modules" / "vitest" / "vitest.mjs"
        result = self.runner.run([str(runtime.node), str(vitest), "run", "tests/babylon-monster-model.test.ts"], env={"CI": "1"}, label="Boss Motion", timeout=180)
        if result.returncode != 0:
            self.set_step("Boss Motion", "FAIL", f"exit={result.returncode}")
            raise RuntimeError("Babylon 怪物模型回歸測試失敗；已停止啟動／發布流程。")
        self.set_step("Boss Motion", "PASS", "Babylon monster regression PASS")

    def _wrangler(self, args: list[str], step: str, timeout: int = 600) -> RunResult:
        runtime = self._require_runtime()
        command = [str(runtime.node), str(runtime.npx_cli), "--yes", f"wrangler@{PINNED_WRANGLER_VERSION}", *args]
        env = {"CLOUDFLARE_ACCOUNT_ID": os.environ.get("CLOUDFLARE_ACCOUNT_ID", DEFAULT_CLOUDFLARE_ACCOUNT_ID)}
        self.set_step(step, "RUNNING", f"Wrangler {PINNED_WRANGLER_VERSION}")
        result = self.runner.run(command, env=env, label=step, timeout=timeout)
        if result.returncode != 0:
            self.set_step(step, "FAIL", f"exit={result.returncode}")
        else:
            self.set_step(step, "PASS", "完成")
        return result

    def _dry_run(self) -> None:
        result = self._wrangler(
            [
                "deploy",
                "--dry-run",
                "--config",
                str(self.config.wrangler_config),
                "--name",
                self.config.worker_name,
            ],
            "Worker Dry-run",
        )
        if result.returncode != 0:
            raise RuntimeError("Wrangler dry-run 失敗。")

    @staticmethod
    def _cloudflare_auth_ok(result: RunResult) -> bool:
        combined = (result.stdout + "\n" + result.stderr).lower()
        unauthenticated_markers = (
            "you are not authenticated",
            "please run `wrangler login`",
            "please run 'wrangler login'",
            "not authenticated",
        )
        return result.returncode == 0 and not any(marker in combined for marker in unauthenticated_markers)

    def _cloudflare_auth(self) -> None:
        who = self._wrangler(["whoami"], "Cloudflare Auth", timeout=120)
        if self._cloudflare_auth_ok(who):
            return

        # Wrangler 4 can print "You are not authenticated" while still returning exit code 0.
        # Never treat return code alone as proof of authentication.
        self.set_step("Cloudflare Auth", "RUNNING", "尚未登入；準備 OAuth Device Login")

        configured_token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
        if configured_token:
            raise RuntimeError(
                "偵測到 CLOUDFLARE_API_TOKEN，但 Cloudflare 驗證失敗。"
                "Wrangler 會優先使用此 Token；請更新或移除無效 Token 後再試。"
            )

        self.log("INFO", "尚未登入 Cloudflare；啟動 Wrangler OAuth Device Login。瀏覽器會開啟 Cloudflare 授權頁，完成一次授權後會自動繼續部署。")
        login = self._wrangler(["login", "--device"], "Cloudflare Login", timeout=420)
        if login.returncode != 0:
            raise RuntimeError("Cloudflare OAuth Device Login 失敗或逾時；請依畫面顯示的驗證網址/代碼完成授權後再試。")

        who = self._wrangler(["whoami"], "Cloudflare Auth", timeout=120)
        if not self._cloudflare_auth_ok(who):
            raise RuntimeError("Cloudflare 登入完成後仍無法驗證帳號；請檢查瀏覽器授權是否完成，或是否有舊的 CLOUDFLARE_API_TOKEN 覆蓋 OAuth。")

    def _deploy(self) -> str:
        result = self._wrangler(
            ["deploy", "--config", str(self.config.wrangler_config), "--name", self.config.worker_name],
            "Cloudflare Deploy",
            timeout=900,
        )
        if result.returncode != 0:
            raise RuntimeError("Cloudflare 正式部署失敗。")
        combined = result.stdout + "\n" + result.stderr
        matches = re.findall(r"https://[A-Za-z0-9.-]+\.workers\.dev(?:/[^\s]*)?", combined)
        if not matches:
            return ""
        return matches[-1].rstrip("/.,;)")

    def _full_release_gate(self, deploy: bool, development_guard_done: bool = False) -> str:
        if not development_guard_done:
            self.run_development_guard()
        self._prepare_runtime()
        self._quiesce_for_dependency_mutation("完整發布 Gate")
        self._step_node_script("Package Integrity", "scripts/verify-package-integrity.mjs")
        self._ensure_dependencies(force=True)
        self._toolchain_self_test()
        self._step_node_script("Release Sync", "scripts/sync-runtime-release.mjs")
        self._step_node_script("Current Verify", "scripts/verify-current.mjs")
        self._step_node_script("Babylon Verify", "scripts/verify-babylon-runtime.mjs")
        self._typecheck()
        self._procedural_boss_tests()
        self._build()
        self._tests()
        self._start_and_verify_local(leave_running=False)
        self._dry_run()
        if not deploy:
            return ""
        self._cloudflare_auth()
        return self._deploy()

    def _start_and_verify_local(self, leave_running: bool) -> None:
        runtime = self._require_runtime()
        self.stop_local()
        self._clear_known_stale_ports()
        self.set_step("Backend", "RUNNING", "127.0.0.1:8787")
        backend = self.runner.start_service("Backend", [str(runtime.node), "--import", "tsx", "server/index.ts"])
        self.set_step("Frontend", "RUNNING", "127.0.0.1:5173")
        frontend = self.runner.start_service(
            "Frontend",
            [str(runtime.node), str(self.config.root / "node_modules" / "vite" / "bin" / "vite.js"), "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
        )
        try:
            deadline = time.monotonic() + 90
            health = None
            while time.monotonic() < deadline:
                self._check_cancel()
                if backend.process.poll() is not None:
                    raise RuntimeError(f"Backend 提前結束 (exit={backend.process.returncode})")
                if frontend.process.poll() is not None:
                    raise RuntimeError(f"Frontend 提前結束 (exit={frontend.process.returncode})")
                front_ok = self._http_ok("http://127.0.0.1:5173/")
                health = self._get_json("http://127.0.0.1:8787/health", timeout=2, quiet=True)
                if front_ok and health and health.get("status") == "ok" and health.get("release") == self.config.release:
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError("等待 Frontend / Backend 就緒逾時。")
            self.set_step("Backend", "PASS", f"{self.config.release} / monsters={health.get('monsters')}")
            self.set_step("Frontend", "PASS", "http://127.0.0.1:5173/")
            self.set_step("Local Health", "PASS", "Frontend + Backend OK")
            self.set_step("Local WebSocket", "RUNNING", "syncProbe")
            result = self.runner.run(
                [str(runtime.node), str(self.config.root / "scripts" / "verify-world-sync.mjs"), self.config.release],
                label="Local WebSocket Snapshot",
                timeout=30,
            )
            if result.returncode != 0:
                self.set_step("Local WebSocket", "FAIL", f"exit={result.returncode}")
                raise RuntimeError("本機 WebSocket world snapshot 驗證失敗。")
            self.set_step("Local WebSocket", "PASS", "syncProbe snapshot OK")
        except Exception:
            self.stop_local()
            raise
        if not leave_running:
            self.stop_local()

    def _remote_health(self, base_url: str) -> dict:
        """Verify Worker + Durable Object while tolerating Cloudflare rollout skew."""
        self.set_step("Network Worker Release", "RUNNING", f"{base_url}/api/release")
        self.set_step("Network Health", "RUNNING", f"{base_url}/health")

        deadline = time.monotonic() + NETWORK_RELEASE_PROPAGATION_TIMEOUT_SECONDS
        worker_release = ""
        health: Optional[dict] = None
        last_state = None

        while time.monotonic() < deadline:
            self._check_cancel()
            nonce = int(time.time() * 1000)
            release_info = self._get_json(f"{base_url}/api/release?probe={nonce}", timeout=10, quiet=True)
            health = self._get_json(f"{base_url}/health?probe={nonce}", timeout=10, quiet=True)

            worker_release = str((release_info or {}).get("release", ""))
            health_release = str((health or {}).get("release", ""))
            worker_ok = bool(release_info and release_info.get("status") == "ok" and worker_release == self.config.release)
            health_ok = bool(health and health.get("status") == "ok" and health_release == self.config.release)

            state = (worker_release or "unknown", health_release or "unknown")
            if state != last_state:
                if worker_ok and not health_ok and health_release:
                    self.log("INFO", f"Cloudflare Worker 已更新為 {worker_release}；Durable Object 仍為 {health_release}，等待全球版本傳播。")
                elif not worker_ok:
                    self.log("INFO", f"等待 Cloudflare Worker 新版本生效：expected={self.config.release}, actual={worker_release or 'unknown'}")
                last_state = state

            if worker_ok:
                self.set_step("Network Worker Release", "PASS", worker_release)
            if worker_ok and health_ok:
                self.set_step("Network Health", "PASS", f"{health_release} / monsters={health.get('monsters')}")
                return health

            time.sleep(NETWORK_RELEASE_POLL_INTERVAL_SECONDS)

        if worker_release != self.config.release:
            self.set_step("Network Worker Release", "FAIL", f"release={worker_release or 'unknown'}")
            raise RuntimeError(f"Cloudflare Worker 版本未完成更新：預期 {self.config.release}，實際 {worker_release or 'unknown'}")

        health_release = str((health or {}).get("release", ""))
        if not health or health.get("status") != "ok":
            self.set_step("Network Health", "FAIL", "invalid /health")
            raise RuntimeError("網路 /health 沒有回傳 Qinglan OK 狀態。")

        self.set_step("Network Health", "FAIL", f"worker={worker_release} / durable={health_release or 'unknown'}")
        raise RuntimeError(
            f"Cloudflare Worker 已是 {worker_release}，但 Durable Object 在 "
            f"{NETWORK_RELEASE_PROPAGATION_TIMEOUT_SECONDS} 秒內仍未更新：{health_release or 'unknown'}。"
        )

    def _remote_websocket(self, base_url: str) -> None:
        runtime = self._require_runtime()
        ws_url = re.sub(r"^https://", "wss://", base_url, flags=re.I)
        ws_url = re.sub(r"^http://", "ws://", ws_url, flags=re.I) + "/socket"
        self.set_step("Network WebSocket", "RUNNING", ws_url)
        result = self.runner.run(
            [str(runtime.node), str(self.config.root / "scripts" / "verify-world-sync.mjs"), self.config.release],
            env={"QINGLAN_WS_URL": ws_url, "QINGLAN_WS_TIMEOUT_MS": "15000"},
            label="Network WebSocket Snapshot",
            timeout=30,
        )
        if result.returncode != 0:
            self.set_step("Network WebSocket", "FAIL", f"exit={result.returncode}")
            raise RuntimeError("網路 WebSocket world snapshot 驗證失敗。")
        self.set_step("Network WebSocket", "PASS", "syncProbe snapshot OK")

    def _clear_known_stale_ports(self) -> None:
        # Auto-stop only when the occupied port answers as a Qinglan service.
        # A random Node/Vite process from another project is never killed automatically.
        for port in (5173, 8787):
            if not self._port_open(port):
                continue
            health_url = f"http://127.0.0.1:{port}/health"
            health = self._get_json(health_url, timeout=1, quiet=True)
            if not health or health.get("status") != "ok" or not str(health.get("release", "")).startswith("P"):
                raise RuntimeError(f"Port {port} 已被其他服務占用；GUI 不會自動終止未確認的程序。")
            if os.name != "nt":
                raise RuntimeError(f"Port {port} 已存在舊的青嵐志服務，請先關閉後重試。")
            pid = self._windows_port_pid(port)
            image = self._windows_image_name(pid) if pid else ""
            if not pid or image.lower() != "node.exe":
                raise RuntimeError(f"Port {port} 是青嵐志服務，但無法安全確認 Node PID (PID={pid or 'unknown'}, {image or 'unknown'})。")
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            subprocess.run(
                ["taskkill.exe", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=False,
                creationflags=flags,
                timeout=10,
            )
            deadline = time.monotonic() + 4.0
            while self._port_open(port) and time.monotonic() < deadline:
                time.sleep(0.10)
            if self._port_open(port):
                raise RuntimeError(f"無法釋放 Port {port} (PID={pid})。")
            self.log("INFO", f"已清除舊青嵐志 Node 服務：port={port}, PID={pid}, release={health.get('release')}")

    @staticmethod
    def _windows_port_pid(port: int) -> Optional[int]:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        cp = subprocess.run(
            ["netstat.exe", "-ano", "-p", "tcp"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=False,
            creationflags=flags,
            timeout=10,
        )
        pattern = re.compile(rf"^\s*TCP\s+\S+:{port}\s+\S+\s+LISTENING\s+(\d+)\s*$", re.I)
        for line in cp.stdout.splitlines():
            match = pattern.match(line)
            if match:
                return int(match.group(1))
        return None

    @staticmethod
    def _windows_image_name(pid: int) -> str:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        cp = subprocess.run(
            ["tasklist.exe", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=False,
            creationflags=flags,
            timeout=10,
        )
        first = cp.stdout.strip().splitlines()[0] if cp.stdout.strip() else ""
        if first.startswith('"'):
            return first.split('","', 1)[0].strip('"')
        return ""

    @staticmethod
    def _port_open(port: int) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.25):
                return True
        except OSError:
            return False

    @staticmethod
    def _http_ok(url: str) -> bool:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                return 200 <= response.status < 500
        except Exception:
            return False

    def _get_json(self, url: str, timeout: int, quiet: bool) -> Optional[dict]:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Qinglan-Python-Test-Center", "Cache-Control": "no-cache", "Pragma": "no-cache"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw)
        except Exception as exc:
            if not quiet:
                self.log("ERR", f"HTTP 失敗：{url}：{exc}")
            return None

    def _resolve_production_endpoint(self, wrangler_url: str = "") -> str:
        candidates: list[str] = []
        if wrangler_url:
            candidates.append(wrangler_url)

        configured = self._configured_custom_domain()
        if configured:
            candidates.append(configured)

        settings = self.config.load_settings()
        cached = str(settings.get("network_url", "")).strip()
        if cached:
            candidates.append(cached)

        env_url = os.environ.get("QINGLAN_NETWORK_URL", "").strip()
        if env_url:
            candidates.append(env_url)

        for value in candidates:
            value = value.strip().rstrip("/.,;)")
            if not value:
                continue
            if not re.match(r"^https?://", value, re.I):
                value = "https://" + value
            return value
        raise RuntimeError(
            "Cloudflare 部署已完成，但 Wrangler 沒有回傳可用端點，且 wrangler.jsonc 也沒有可解析的 custom domain。"
            "GUI 不要求手動輸入網址；請查看 Cloudflare Deploy 的 stderr/stdout 以確認 workers.dev 是否已啟用。"
        )

    def _configured_custom_domain(self) -> str:
        wrangler = self.config.wrangler
        route_items = []
        if "route" in wrangler:
            route_items.append(wrangler.get("route"))
        route_items.extend(wrangler.get("routes", []) if isinstance(wrangler.get("routes", []), list) else [])
        for route in route_items:
            if isinstance(route, dict):
                if not route.get("custom_domain"):
                    continue
                pattern = str(route.get("pattern", "")).strip()
            else:
                pattern = str(route or "").strip()
            if not pattern:
                continue
            host = pattern.split("/", 1)[0].strip().lstrip("*.")
            if host and "*" not in host:
                return "https://" + host
        return ""

    def _deployment_fingerprint(self) -> str:
        h = hashlib.sha256()
        roots = [
            self.config.root / "src",
            self.config.root / "public",
            self.config.root / "cloudflare" / "world-worker",
        ]
        singles = [
            self.config.root / "package.json",
            self.config.root / "package-lock.json",
            self.config.root / "tsconfig.json",
            self.config.root / "vite.config.ts",
            self.config.root / "index.html",
        ]
        files: list[Path] = []
        for base in roots:
            if base.exists():
                files.extend(p for p in base.rglob("*") if p.is_file())
        files.extend(p for p in singles if p.is_file())
        for path in sorted(set(files), key=lambda p: p.relative_to(self.config.root).as_posix().lower()):
            rel = path.relative_to(self.config.root).as_posix()
            h.update(rel.encode("utf-8"))
            h.update(b"\0")
            with path.open("rb") as fh:
                for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                    h.update(chunk)
            h.update(b"\0")
        return h.hexdigest()

    def _save_deployment(self, url: str, fingerprint: str) -> None:
        data = self.config.load_settings()
        data.update({
            "network_url": url,
            "deploy_fingerprint": fingerprint,
            "deployed_release": self.config.release,
            "deployed_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })
        self.config.save_settings(data)

    def _require_runtime(self) -> NodeRuntime:
        if not self.runtime:
            raise RuntimeError("Node Runtime 尚未初始化。")
        return self.runtime

    def _check_cancel(self) -> None:
        if self.cancel_event.is_set():
            raise CancelledError("使用者已取消目前工作。")


class QinglanApp:
    def __init__(self, project: Path) -> None:
        import tkinter as tk
        from tkinter import messagebox, ttk

        self.tk = tk
        self.ttk = ttk
        self.messagebox = messagebox
        self.config = ProjectConfig(project)
        self.events: queue.Queue[tuple] = queue.Queue()
        self.controller = QinglanController(self.config, self.events.put)
        self.root = tk.Tk()
        self.root.title(f"{APP_TITLE} · {self.config.release}{GUI_REVISION}")
        self.root.geometry("1220x820")
        self.root.minsize(980, 680)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self._build_style()
        self._build_ui()
        self._load_settings()
        self.root.after(80, self._pump_events)

    def _build_style(self) -> None:
        style = self.ttk.Style(self.root)
        try:
            style.theme_use("vista")
        except Exception:
            pass
        style.configure("Title.TLabel", font=("Microsoft JhengHei UI", 16, "bold"))
        style.configure("Sub.TLabel", font=("Microsoft JhengHei UI", 9))
        style.configure("Action.TButton", font=("Microsoft JhengHei UI", 10, "bold"), padding=(10, 8))
        style.configure("Treeview", rowheight=26, font=("Microsoft JhengHei UI", 9))
        style.configure("Treeview.Heading", font=("Microsoft JhengHei UI", 9, "bold"))

    def _build_ui(self) -> None:
        tk, ttk = self.tk, self.ttk
        outer = ttk.Frame(self.root, padding=12)
        outer.pack(fill="both", expand=True)

        header = ttk.Frame(outer)
        header.pack(fill="x")
        ttk.Label(header, text="青嵐志 啟動 / 測試中心", style="Title.TLabel").pack(side="left")
        ttk.Label(header, text=f"{self.config.release}{GUI_REVISION} · Python GUI · Development Guard", style="Sub.TLabel").pack(side="left", padx=(12, 0), pady=(7, 0))
        self.busy_text = tk.StringVar(value="待命")
        ttk.Label(header, textvariable=self.busy_text, style="Sub.TLabel").pack(side="right", pady=(7, 0))

        project_bar = ttk.Frame(outer)
        project_bar.pack(fill="x", pady=(7, 8))
        ttk.Label(project_bar, text="專案：").pack(side="left")
        ttk.Label(project_bar, text=str(self.config.root)).pack(side="left", fill="x", expand=True)

        actions = ttk.Frame(outer)
        actions.pack(fill="x", pady=(0, 8))
        self.buttons: list = []
        self._action_button(actions, "本機啟動測試", lambda: self._start_local()).pack(side="left", padx=(0, 6))
        self._action_button(actions, "網路啟動測試", lambda: self._start_network()).pack(side="left", padx=6)
        self._action_button(actions, "完整發布預檢", lambda: self._start_preflight()).pack(side="left", padx=6)
        self._action_button(actions, "正式部署＋網路驗證", lambda: self._start_deploy()).pack(side="left", padx=6)
        self.stop_button = ttk.Button(actions, text="停止本機服務", command=self._stop_local, padding=(10, 8))
        self.stop_button.pack(side="left", padx=6)
        self.cancel_button = ttk.Button(actions, text="取消目前工作", command=self.controller.cancel, padding=(10, 8), state="disabled")
        self.cancel_button.pack(side="right")

        dev_actions = ttk.Frame(outer)
        dev_actions.pack(fill="x", pady=(0, 8))
        self._action_button(dev_actions, "開發規則檢查", self._start_development_guard).pack(side="left", padx=(0, 6))
        ttk.Button(dev_actions, text="查看開發規則", command=self._show_development_rules, padding=(10, 8)).pack(side="left", padx=6)
        ttk.Label(dev_actions, text="R27.2：一般移動提高為 3.8 m/s，Walking/Fast_Run / retarget / foot-lock 繼續沿用；弓箭只在 Bow 攻擊期間加入左手伸弓、右手頰側拉弦的受限校正，走跑與其他武器不受影響。", style="Sub.TLabel").pack(side="left", padx=(12, 0))

        network = ttk.LabelFrame(outer, text="網路端點（全自動）", padding=(10, 7))
        network.pack(fill="x", pady=(0, 8))
        ttk.Label(network, text="端點").pack(side="left")
        self.network_url = tk.StringVar(value="自動偵測；不需要輸入網址")
        ttk.Label(network, textvariable=self.network_url, style="Sub.TLabel").pack(side="left", fill="x", expand=True, padx=(8, 8))
        ttk.Button(network, text="開啟目前端點", command=self._open_network).pack(side="left")
        self.open_browser = tk.BooleanVar(value=True)
        ttk.Checkbutton(network, text="測試成功後自動開啟", variable=self.open_browser).pack(side="left", padx=(10, 0))

        pane = ttk.Panedwindow(outer, orient="vertical")
        pane.pack(fill="both", expand=True)

        status_frame = ttk.LabelFrame(pane, text="Release Gate / 啟動狀態", padding=6)
        pane.add(status_frame, weight=2)
        self.tree = ttk.Treeview(status_frame, columns=("status", "detail"), show="tree headings", height=12)
        self.tree.heading("#0", text="步驟")
        self.tree.heading("status", text="狀態")
        self.tree.heading("detail", text="內容")
        self.tree.column("#0", width=190, stretch=False)
        self.tree.column("status", width=100, stretch=False, anchor="center")
        self.tree.column("detail", width=760, stretch=True)
        self.tree.pack(fill="both", expand=True)
        self.step_items: dict[str, str] = {}
        for step in [
            "Development Guard", "Change Impact", "Node Runtime", "Package Integrity", "Dependencies", "Toolchain", "Release Sync", "Current Verify", "Babylon Verify",
            "TypeScript", "Boss Motion", "Build", "Tests", "Backend", "Frontend", "Local Health", "Local WebSocket",
            "Worker Dry-run", "Cloudflare Auth", "Cloudflare Login", "Cloudflare Deploy", "Network Endpoint", "Network Worker Release", "Network Health", "Network WebSocket",
        ]:
            self.step_items[step] = self.tree.insert("", "end", text=step, values=("—", ""))

        log_frame = ttk.LabelFrame(pane, text="即時 Log（stdout / stderr）", padding=6)
        pane.add(log_frame, weight=3)
        log_wrap = ttk.Frame(log_frame)
        log_wrap.pack(fill="both", expand=True)
        self.log_text = tk.Text(log_wrap, wrap="none", font=("Consolas", 9), undo=False)
        ybar = ttk.Scrollbar(log_wrap, orient="vertical", command=self.log_text.yview)
        xbar = ttk.Scrollbar(log_wrap, orient="horizontal", command=self.log_text.xview)
        self.log_text.configure(yscrollcommand=ybar.set, xscrollcommand=xbar.set)
        self.log_text.grid(row=0, column=0, sticky="nsew")
        ybar.grid(row=0, column=1, sticky="ns")
        xbar.grid(row=1, column=0, sticky="ew")
        log_wrap.rowconfigure(0, weight=1)
        log_wrap.columnconfigure(0, weight=1)
        self.log_text.tag_configure("PASS", foreground="#127a31")
        self.log_text.tag_configure("FAIL", foreground="#b00020")
        self.log_text.tag_configure("ERR", foreground="#b00020")
        self.log_text.tag_configure("WARN", foreground="#9a6100")
        self.log_text.tag_configure("CMD", foreground="#4d4d4d")
        self.log_text.configure(state="disabled")

        footer = ttk.Frame(outer)
        footer.pack(fill="x", pady=(7, 0))
        self.local_state = tk.StringVar(value="本機服務：未啟動")
        ttk.Label(footer, textvariable=self.local_state).pack(side="left")
        ttk.Label(footer, text="所有子程序皆由 Python 直接啟動，不透過命令殼層或批次啟動器。", style="Sub.TLabel").pack(side="right")

    def _action_button(self, parent, text: str, command: Callable[[], None]):
        button = self.ttk.Button(parent, text=text, command=command, style="Action.TButton")
        self.buttons.append(button)
        return button

    def _load_settings(self) -> None:
        settings = self.config.load_settings()
        saved = str(settings.get("network_url", "")).strip()
        if saved:
            self.network_url.set(saved)
        else:
            self.network_url.set("自動偵測；首次網路測試會在必要時自動部署")

    def _save_settings(self) -> None:
        # Network endpoints are written only by successful automated deployment verification.
        # The UI is intentionally read-only: users never need to enter a URL.
        return

    def _reset_steps(self) -> None:
        for item in self.step_items.values():
            self.tree.set(item, "status", "—")
            self.tree.set(item, "detail", "")

    def _start_development_guard(self) -> None:
        self._reset_steps()
        self.controller.launch_job("開發規則檢查", self.controller.development_guard_only)

    def _show_development_rules(self) -> None:
        win = self.tk.Toplevel(self.root)
        win.title("青嵐志 Development Guard 規則")
        win.geometry("1040x560")
        win.minsize(780, 420)
        frame = self.ttk.Frame(win, padding=10)
        frame.pack(fill="both", expand=True)
        tree = self.ttk.Treeview(frame, columns=("category", "severity", "rule"), show="headings")
        tree.heading("category", text="分類")
        tree.heading("severity", text="等級")
        tree.heading("rule", text="規則")
        tree.column("category", width=150, stretch=False)
        tree.column("severity", width=70, stretch=False, anchor="center")
        tree.column("rule", width=760, stretch=True)
        ybar = self.ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=ybar.set)
        tree.grid(row=0, column=0, sticky="nsew")
        ybar.grid(row=0, column=1, sticky="ns")
        frame.rowconfigure(0, weight=1); frame.columnconfigure(0, weight=1)
        for rule in DevelopmentGuard.rule_rows():
            tree.insert("", "end", values=(f"{rule['id']} · {rule['category']}", rule['severity'], f"{rule['title']}｜{rule['detail']}"))
        self.ttk.Label(frame, text="完整發布仍會執行全套 Regression；Change Impact 只用來告訴開發者這次改動優先影響哪些區域。", style="Sub.TLabel").grid(row=1, column=0, sticky="w", pady=(8, 0))

    def _start_local(self) -> None:
        self._reset_steps()
        self.controller.launch_job("本機啟動測試", lambda: self.controller.local_test(self.open_browser.get()))

    def _start_network(self) -> None:
        self._reset_steps()
        self.controller.launch_job("網路啟動測試", lambda: self.controller.network_test(self.open_browser.get()))

    def _start_preflight(self) -> None:
        self._reset_steps()
        self.controller.launch_job("完整發布預檢", self.controller.release_preflight)

    def _start_deploy(self) -> None:
        self._reset_steps()
        self.controller.launch_job("正式部署＋網路驗證", lambda: self.controller.deploy_and_verify(self.open_browser.get()))

    def _stop_local(self) -> None:
        self.controller.stop_local()
        self.local_state.set("本機服務：未啟動")

    def _open_network(self) -> None:
        value = self.network_url.get().strip()
        if re.match(r"^https?://", value, re.I):
            webbrowser.open(value)
        else:
            self.messagebox.showinfo("網路端點", "目前尚無已驗證端點。直接按『網路啟動測試』即可全自動偵測／部署並驗證。")

    def _pump_events(self) -> None:
        while True:
            try:
                event = self.events.get_nowait()
            except queue.Empty:
                break
            kind = event[0]
            if kind == "log":
                self._append_log(event[1], event[2])
            elif kind == "step":
                _, step, status, detail = event
                item = self.step_items.get(step)
                if item:
                    self.tree.set(item, "status", status)
                    self.tree.set(item, "detail", detail)
                    self.tree.see(item)
            elif kind == "busy":
                _, busy, name = event
                self.busy_text.set(name if busy else "待命")
                state = "disabled" if busy else "normal"
                for button in self.buttons:
                    button.configure(state=state)
                self.cancel_button.configure(state="normal" if busy else "disabled")
            elif kind == "dialog":
                _, level, title, message = event
                getattr(self.messagebox, f"show{level}")(title, message)
            elif kind == "done":
                _, ok, name = event
                self._append_log("PASS" if ok else "WARN", f"{name} {'完成' if ok else '未完成'}")
            elif kind == "network_url":
                self.network_url.set(event[1])
                self._save_settings()
            elif kind == "local_ready":
                ready = bool(event[1])
                self.local_state.set("本機服務：RUNNING · http://127.0.0.1:5173/" if ready else "本機服務：未啟動")
        self.root.after(80, self._pump_events)

    def _append_log(self, level: str, text: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        line = f"[{timestamp}] [{level}] {text}\n"
        self.log_text.configure(state="normal")
        self.log_text.insert("end", line, level if level in {"PASS", "FAIL", "ERR", "WARN", "CMD"} else None)
        self.log_text.see("end")
        self.log_text.configure(state="disabled")
        log_dir = self.config.root / "logs"
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
            with (log_dir / "gui-test-center-latest.log").open("a", encoding="utf-8") as fh:
                fh.write(line)
        except Exception:
            pass

    def _on_close(self) -> None:
        self._save_settings()
        self.controller.cancel()
        self.controller.stop_local()
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def self_test(project: Path) -> int:
    import ast

    config = ProjectConfig(project)
    source = (project / "QINGLAN_TEST_CENTER.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    subprocess_calls = []
    unsafe_shell = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = ""
        if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == "subprocess":
            name = func.attr
        if name not in {"run", "Popen"}:
            continue
        subprocess_calls.append(node)
        for kw in node.keywords:
            if kw.arg == "shell" and not (isinstance(kw.value, ast.Constant) and kw.value.value is False):
                unsafe_shell.append(node.lineno)

    checks = {
        "package.json exists": (project / "package.json").is_file(),
        "world sync verifier exists": (project / "scripts" / "verify-world-sync.mjs").is_file(),
        "worker config exists": config.wrangler_config.is_file(),
        "all explicit subprocess shell flags are False": not unsafe_shell,
        "direct-process guard is present": "_assert_direct(command)" in source,
        "direct npm CLI": "npm-cli.js" in source,
        "direct npx CLI": "npx-cli.js" in source,
        "direct Vite": '"vite" / "bin" / "vite.js"' in source,
        "direct Vitest": '"vitest" / "vitest.mjs"' in source,
        "local websocket probe": "verify-world-sync.mjs" in source,
        "pinned Wrangler": PINNED_WRANGLER_VERSION in source,
        "Cloudflare device login fallback": '_cloudflare_auth_ok' in source and '["login", "--device"]' in source and 'you are not authenticated' in source,
        "network test is automatic": "def network_test(self, open_browser: bool)" in source and "_deployment_fingerprint" in source,
        "no manual network URL prompt": ("請先" + "填入網路網址") not in source and "network_" + "entry" not in source,
        "dependency mutation quiesces local services": "_quiesce_for_dependency_mutation" in source,
        "Windows esbuild EPERM retry is bounded": "EPERM 自動重試" in source and '"eperm" in combined and "esbuild" in combined' in source,
        "development rules embedded in Python": "PROJECT_RULES = (" in source and "class DevelopmentGuard" in source,
        "development guard runs before release gate": "self.run_development_guard()" in source and "Development Guard" in source,
        "change impact matrix is embedded": "CHANGE_IMPACT_RULES = (" in source and "impact_for" in source,
        "development baseline exists": (project / DEVELOPMENT_BASELINE).is_file(),
        "Babylon verifier exists": (project / "scripts" / "verify-babylon-runtime.mjs").is_file(),
        "procedural boss regression exists": (project / "tests" / "procedural-boss-animation.test.ts").is_file(),
        "local test hard-gates TypeScript and boss motion": "self._typecheck()" in source and "self._procedural_boss_tests()" in source,
        "subprocess sites discovered": len(subprocess_calls) >= 4,
    }
    failed = False
    for name, ok in checks.items():
        print(("PASS" if ok else "FAIL"), name)
        failed |= not ok
    print("GUI SELF-TEST:", "PASS" if not failed else "FAIL")
    return 1 if failed else 0

def main() -> int:
    parser = argparse.ArgumentParser(description=APP_TITLE)
    parser.add_argument("--self-test", action="store_true", help="run source/package self-test without opening GUI")
    args = parser.parse_args()
    project = Path(__file__).resolve().parent
    if args.self_test:
        return self_test(project)
    try:
        app = QinglanApp(project)
    except Exception as exc:
        try:
            import tkinter.messagebox as messagebox
            messagebox.showerror(APP_TITLE, f"GUI 啟動失敗：\n{exc}")
        except Exception:
            print(f"GUI 啟動失敗：{exc}", file=sys.stderr)
        return 2
    app.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
