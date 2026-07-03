"use client";

import { applyRecipe, BUILTIN_RECIPES } from "@evm-troubleshooter/core";
import { isAddress } from "viem";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Saved templates (PLAN §8): pick a recipe, fill its param slots, and load
 * the encoded calldata + target into the troubleshooter.
 */
export function RecipePicker({
  onApply,
}: {
  onApply: (target: string, calldata: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState(BUILTIN_RECIPES[0]!.id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const recipe =
    BUILTIN_RECIPES.find((r) => r.id === recipeId) ?? BUILTIN_RECIPES[0]!;

  function apply() {
    const target = values.token ?? "";
    if (!isAddress(target.trim())) {
      setError("Target contract must be a valid address");
      return;
    }
    const result = applyRecipe(recipe, values);
    if (!result.ok) {
      setError(result.errors.join("; "));
      return;
    }
    onApply(target.trim(), result.data);
    setError(null);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="recipe-button">
          Recipes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recipes</DialogTitle>
          <DialogDescription>
            Fill a template&apos;s parameters to build a call.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="recipe">Template</Label>
            <select
              id="recipe"
              data-testid="recipe-select"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={recipeId}
              onChange={(e) => {
                setRecipeId(e.target.value);
                setValues({});
              }}
            >
              {BUILTIN_RECIPES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              {recipe.description}
            </p>
          </div>
          {recipe.params.map((p) => (
            <div key={p.key} className="grid gap-2">
              <Label htmlFor={`param-${p.key}`}>{p.label}</Label>
              <Input
                id={`param-${p.key}`}
                data-testid={`recipe-param-${p.key}`}
                placeholder={p.placeholder ?? p.type}
                value={values[p.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [p.key]: e.target.value }))
                }
              />
            </div>
          ))}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button onClick={apply} data-testid="recipe-apply">
            Load into troubleshooter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
