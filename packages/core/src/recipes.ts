import { parseAbi, type Hex } from "viem";
import { encodeCall } from "./build";

export interface RecipeParam {
  key: string;
  type: string;
  label: string;
  placeholder?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  /** human-readable ABI signatures for the target function */
  abi: string[];
  functionName: string;
  params: RecipeParam[];
  /** per-arg templates with {{param}} placeholders */
  argTemplate: string[];
}

export type ApplyRecipeResult =
  { ok: true; data: Hex } | { ok: false; errors: string[] };

/** Fill a recipe's templates with param values and encode the calldata. */
export function applyRecipe(
  recipe: Recipe,
  values: Record<string, string>,
): ApplyRecipeResult {
  const errors: string[] = [];
  for (const param of recipe.params) {
    if (!values[param.key]?.trim()) {
      errors.push(`${param.label} is required`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const args = recipe.argTemplate.map((tpl) =>
    tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? ""),
  );

  const abi = parseAbi(recipe.abi);
  const fn = abi.find(
    (item) => item.type === "function" && item.name === recipe.functionName,
  );
  if (!fn || fn.type !== "function") {
    return {
      ok: false,
      errors: [`function ${recipe.functionName} not in ABI`],
    };
  }
  return encodeCall(fn, args);
}

export const BUILTIN_RECIPES: Recipe[] = [
  {
    id: "approve-then-swap",
    name: "ERC-20 approve",
    description:
      "Approve a spender to move your tokens (the first half of an approve-then-swap flow).",
    abi: ["function approve(address spender, uint256 amount) returns (bool)"],
    functionName: "approve",
    params: [
      { key: "token", type: "address", label: "Token (target contract)" },
      {
        key: "spender",
        type: "address",
        label: "Spender",
        placeholder: "router",
      },
      { key: "amount", type: "uint256", label: "Amount (wei)" },
    ],
    argTemplate: ["{{spender}}", "{{amount}}"],
  },
  {
    id: "erc20-transfer",
    name: "ERC-20 transfer",
    description: "Transfer tokens to a recipient.",
    abi: ["function transfer(address to, uint256 amount) returns (bool)"],
    functionName: "transfer",
    params: [
      { key: "token", type: "address", label: "Token (target contract)" },
      { key: "to", type: "address", label: "Recipient" },
      { key: "amount", type: "uint256", label: "Amount (wei)" },
    ],
    argTemplate: ["{{to}}", "{{amount}}"],
  },
  {
    id: "erc20-transferfrom",
    name: "ERC-20 transferFrom",
    description:
      "Move tokens on behalf of an owner (requires an allowance — pair with the isolation probe).",
    abi: [
      "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    ],
    functionName: "transferFrom",
    params: [
      { key: "token", type: "address", label: "Token (target contract)" },
      { key: "from", type: "address", label: "From (owner)" },
      { key: "to", type: "address", label: "To" },
      { key: "amount", type: "uint256", label: "Amount (wei)" },
    ],
    argTemplate: ["{{from}}", "{{to}}", "{{amount}}"],
  },
];
