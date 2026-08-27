/**
 * Sólo se usa cuando Jest invoca babel-jest. La app en producción NO necesita
 * babel: corre Node directo. Esto existe únicamente para transformar el ESM
 * de `jose` (sin build CJS) durante los tests.
 */
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
