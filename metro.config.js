// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Tailwind classes (className="...") through NativeWind; the theme lives in global.css.
module.exports = withNativewind(config);
