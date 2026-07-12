import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ThreadErrorBanner } from "./ThreadErrorBanner";

describe("ThreadErrorBanner", () => {
  it("keeps long error text in the content column and the dismiss action compact", () => {
    const error =
      "ProviderModelNotFoundError: Model not found: openai/gpt-5.6-some-very-long-model-name";
    const markup = renderToStaticMarkup(
      <ThreadErrorBanner error={error} onDismiss={() => undefined} />,
    );

    const descriptionStart = markup.indexOf('data-slot="alert-description"');
    const errorStart = markup.indexOf(error);
    const actionStart = markup.indexOf('data-slot="alert-action"');

    expect(descriptionStart).toBeGreaterThan(-1);
    expect(errorStart).toBeGreaterThan(descriptionStart);
    expect(actionStart).toBeGreaterThan(errorStart);
    expect(markup).toContain(
      'class="flex min-w-0 flex-1 flex-col gap-0.5"><div class="flex flex-col gap-2.5 text-muted-foreground min-w-0" data-slot="alert-description"',
    );
    expect(markup).toContain("line-clamp-3 min-w-0 break-words");
    expect(markup).toContain("size-7");
    expect(markup).toContain("sm:size-6");
  });
});
