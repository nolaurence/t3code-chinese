export function shouldBundleSandboxedPreloadDependency(id: string): boolean {
  return (
    id.startsWith("@t3tools/") || id === "@clerk/electron" || id.startsWith("@clerk/electron/")
  );
}
