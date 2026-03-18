export type ParsedModelSpec = {
  modelId: string;
  displayName: string;
};

export function parseModelSpec(spec: string | null | undefined): ParsedModelSpec {
  const raw = String(spec ?? '').trim();
  if (!raw) return { modelId: '', displayName: '' };

  const [idPart, namePart] = raw.split('#', 2);
  const modelId = (idPart || '').trim();
  const displayName = (namePart || idPart || '').trim();
  return { modelId, displayName };
}

export function modelIdFromSpec(spec: string | null | undefined): string {
  return parseModelSpec(spec).modelId;
}

export function displayNameFromSpec(spec: string | null | undefined): string {
  return parseModelSpec(spec).displayName;
}

export function firstModelIdFromChannel(channel: any): string | null {
  const models = Array.isArray(channel?.models) ? channel.models : [];
  for (const m of models) {
    const id = modelIdFromSpec(m);
    if (id) return id;
  }
  return null;
}

export function channelContainsModelId(channel: any, modelId: string): boolean {
  const id = String(modelId || '').trim();
  if (!id) return false;
  const models = Array.isArray(channel?.models) ? channel.models : [];
  return models.some((m: any) => modelIdFromSpec(m) === id);
}
