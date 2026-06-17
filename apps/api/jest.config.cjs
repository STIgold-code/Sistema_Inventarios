/** Configuracion de Jest para tests de integracion (DB real). */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.spec.ts"],
  moduleNameMapper: {
    "^@bm/tipos$": "<rootDir>/../../packages/tipos-dominio/src/index.ts",
    "^@bm/contratos$": "<rootDir>/../../packages/contratos/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: { module: "commonjs", verbatimModuleSyntax: false } },
    ],
  },
  testTimeout: 30000,
};
