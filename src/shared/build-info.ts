import packageJson from '../../package.json' with { type: 'json' };

/** Single runtime source for the release handshake and UI build label. */
export const BUILD_VERSION = packageJson.version;
export const BUILD_RELEASE = `P${BUILD_VERSION}`;
export const BUILD_LABEL = 'BABYLON.JS ENGINE / COMMERCIAL XIANXIA PBR LOOKDEV / REFERENCE-MATCHED ACES GRADE / CSM + SSAO2 / BABYLON GLTF-VRM BRIDGE / RENDERER-INDEPENDENT A* NAVIGATION';
export const BUILD_DISPLAY = `${BUILD_RELEASE} · ${BUILD_LABEL}`;
