const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_CONFIG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">89.167.4.8</domain>
  </domain-config>
</network-security-config>`;

/** Play/production: HTTP API (89.167.4.8) icin cleartext izni. */
function withAndroidCleartext(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const resPath = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(resPath, { recursive: true });
      fs.writeFileSync(path.join(resPath, "network_security_config.xml"), NETWORK_CONFIG_XML);
      return cfg;
    }
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$["android:usesCleartextTraffic"] = "true";
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return cfg;
  });

  return config;
}

module.exports = withAndroidCleartext;
