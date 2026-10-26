const { withAndroidManifest } = require('expo/config-plugins');
module.exports = config => withAndroidManifest(config, updated => {
  const manifest = updated.modResults.manifest;
  manifest.queries ||= [];
  if (!manifest.queries.some(query => query.package?.some(item => item.$?.['android:name'] === 'io.metamask'))) manifest.queries.push({package:[{$:{'android:name':'io.metamask'}}]});
  return updated;
});
