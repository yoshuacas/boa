const RESERVED_NAMES = ['v1', 'health', '_internal'];

export function buildRegistry(descriptors) {
  const registry = {};

  for (const desc of descriptors) {
    if (RESERVED_NAMES.includes(desc.name)) {
      throw new Error(
        `Reserved function name '${desc.name}'. Choose a different name.`,
      );
    }

    registry[desc.name] = {
      visibility: desc.visibility,
      timeout: desc.timeout,
      memory: desc.memory,
    };
  }

  return registry;
}
