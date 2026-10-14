import { VIRTUAL_MODEL_FAMILIES, getModelFallbackChain, getAllActiveModelCooldowns, clearModelCooldown } from "open-sse/services/modelFallback.js";
import { NextResponse } from "next/server";
import { getModelAliases, setModelAlias } from "@/models";
import { getDisabledModels } from "@/lib/disabledModelsDb";
import { AI_MODELS } from "@/shared/constants/config";
import { getProviderAlias } from "@/shared/constants/providers";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

// GET /api/models - Get models with aliases
export async function GET() {
  try {
    const modelAliases = await getModelAliases();
    const disabled = await getDisabledModels();

    const models = AI_MODELS
      .filter((m) => {
        const alias = getProviderAlias(m.provider) || m.provider;
        const list = disabled[alias] || disabled[m.provider] || [];
        return !list.includes(m.model);
      })
      .map((m) => {
        const fullModel = `${m.provider}/${m.model}`;
        const providerAlias = getProviderAlias(m.provider) || m.provider;
        const routedModel = `${providerAlias}/${m.model}`;
        const c = getCapabilitiesForModel(m.provider, m.model);
        return {
          ...m,
          fullModel,
          routedModel,
          alias: modelAliases[fullModel] || m.model,
          caps: {
            vision: c.vision,
            search: c.search,
            reasoning: c.reasoning,
            contextWindow: c.contextWindow,
            maxOutput: c.maxOutput,
          },
        };
      });
    // Add virtual fallback models
    const virtualModels = Object.entries(VIRTUAL_MODEL_FAMILIES).map(([vId, famKey]) => {
      const chain = getModelFallbackChain(vId);
      const topModel = chain[0] || vId;
      const provider = vId.startsWith("gemini-") ? "antigravity" : vId.startsWith("claude-") ? "anthropic" : "openai";
      const c = getCapabilitiesForModel(provider, topModel);
      const name = `${vId.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase())} (Auto Fallback)`;
      return {
        provider: "virtual",
        model: vId,
        name,
        fullModel: `virtual/${vId}`,
        routedModel: vId,
        alias: vId,
        isVirtual: true,
        family: famKey,
        fallbackChain: chain,
        caps: {
          vision: c.vision,
          search: c.search,
          reasoning: c.reasoning,
          contextWindow: c.contextWindow,
          maxOutput: c.maxOutput,
        },
      };
    });

    const activeCooldowns = getAllActiveModelCooldowns();

    return NextResponse.json({ models: [...models, ...virtualModels], activeCooldowns });
  } catch (error) {
    console.log("Error fetching models:", error);
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 });
  }
}

// PUT /api/models - Update model alias
export async function PUT(request) {
  try {
    const body = await request.json();
    const { model, alias } = body;

    if (!model || !alias) {
      return NextResponse.json({ error: "Model and alias required" }, { status: 400 });
    }

    const modelAliases = await getModelAliases();

    // Check if alias already exists for different model
    const existingModel = Object.entries(modelAliases).find(
      ([key, val]) => val === alias && key !== model
    );

    if (existingModel) {
      return NextResponse.json({ error: "Alias already in use" }, { status: 400 });
    }

    // Update alias
    await setModelAlias(model, alias);

    return NextResponse.json({ success: true, model, alias });
  } catch (error) {
    console.log("Error updating alias:", error);
    return NextResponse.json({ error: "Failed to update alias" }, { status: 500 });
  }
}

// DELETE /api/models - Clear cooldown cache for models
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const model = searchParams.get("model");
    clearModelCooldown(provider, model);
    return NextResponse.json({ success: true, message: "Model cooldown cache cleared" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
