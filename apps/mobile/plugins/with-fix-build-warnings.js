/**
 * Expo config plugin — silences two recurring iOS build warnings that
 * come back after every `expo prebuild`:
 *
 *  1. "[Expo Dev Launcher] Strip Local Network Keys for Release" has no
 *     declared inputs/outputs, so Xcode warns it runs on every build.
 *     The script intentionally always runs in non-Debug configs, so we
 *     set `alwaysOutOfDate = 1` on the phase. This is equivalent to
 *     unchecking "Based on dependency analysis" in Xcode.
 *
 *  2. Some pod resource bundles (e.g. SDWebImage-SDWebImage) ship with
 *     `IPHONEOS_DEPLOYMENT_TARGET` of 9.0, which Xcode 16+ flags as a
 *     mismatch against the app's minimum. We bump every pod target
 *     below the app's iOS deployment target up to the minimum in a
 *     Podfile `post_install` block.
 */
const { withXcodeProject, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const STRIP_LOCAL_NETWORK_PHASE_NAME =
  '[Expo Dev Launcher] Strip Local Network Keys for Release';

const POD_DEPLOYMENT_POST_INSTALL_MARKER =
  '# harpa: bump pod deployment targets';
const IOS_DEPLOYMENT_TARGET = '16.4';

function withStripLocalNetworkAlwaysOutOfDate(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const phases =
      (project.hash &&
        project.hash.project &&
        project.hash.project.objects &&
        project.hash.project.objects.PBXShellScriptBuildPhase) ||
      {};
    for (const key of Object.keys(phases)) {
      const phase = phases[key];
      if (!phase || typeof phase !== 'object') continue;
      const rawName = phase.name ?? '';
      const name = String(rawName).replace(/^"|"$/g, '');
      if (name === STRIP_LOCAL_NETWORK_PHASE_NAME) {
        phase.alwaysOutOfDate = 1;
      }
    }
    return cfg;
  });
}

function withPodDeploymentTargetBump(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile',
      );
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes(POD_DEPLOYMENT_POST_INSTALL_MARKER)) {
        return cfg;
      }

      const minTarget =
        cfg.ios?.deploymentTarget ||
        cfg.ios?.minimumOSVersion ||
        IOS_DEPLOYMENT_TARGET;

      const snippet = [
        '',
        `    ${POD_DEPLOYMENT_POST_INSTALL_MARKER}`,
        '    installer.pods_project.targets.each do |t|',
        '      t.build_configurations.each do |bc|',
        "        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
        `        if current.nil? || current.to_f < ${minTarget}.to_f`,
        `          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minTarget}'`,
        '        end',
        '      end',
        '    end',
      ].join('\n');

      // Inject just before the closing of the `post_install do |installer|` block.
      const postInstallClose =
        /(react_native_post_install\([\s\S]*?\)\s*\n)(\s*end\s*\n\s*end\s*\n?\s*)$/;
      if (postInstallClose.test(contents)) {
        contents = contents.replace(
          postInstallClose,
          (_match, head, tail) => `${head}${snippet}\n${tail}`,
        );
      } else {
        // Fallback: append a fresh post_install block at the end of the target.
        const targetEnd = /(\n\s*end\s*\n?)$/;
        const fallback = [
          '',
          '  post_install do |installer|',
          snippet,
          '  end',
          '',
        ].join('\n');
        contents = contents.replace(targetEnd, `${fallback}$1`);
      }

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
}

module.exports = function withFixBuildWarnings(config) {
  config = withStripLocalNetworkAlwaysOutOfDate(config);
  config = withPodDeploymentTargetBump(config);
  return config;
};
