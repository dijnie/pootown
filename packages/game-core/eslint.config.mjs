import typescriptParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@nestjs/*",
                "colyseus",
                "colyseus/*",
                "pg",
                "pg/*",
                "typeorm",
                "typeorm/*",
                "prisma",
                "prisma/*",
                "*solana*",
                "*anchor*",
                "*wallet*",
                "node:*",
              ],
              message: "Game core must remain pure and infrastructure neutral.",
            },
          ],
        },
      ],
    },
  },
];
