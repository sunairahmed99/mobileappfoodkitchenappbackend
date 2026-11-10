// Babel config used by babel-jest to transform the ESM source ("type": "module")
// into CommonJS so Jest can load it.
module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
        modules: 'commonjs',
      },
    ],
  ],
};
