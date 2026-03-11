const COPY_EVENT_NAME = "clusterwatch:copy";

export function copyToClipboard(value: string): void {
  if (value === "" || value === "--" || typeof navigator === "undefined" || !navigator.clipboard) {
    return;
  }

  void navigator.clipboard.writeText(value).then(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(COPY_EVENT_NAME, {
        detail: { value },
      }),
    );
  });
}

export function copyTitle(value: string): string | undefined {
  if (value === "" || value === "--") {
    return undefined;
  }

  return `${value}\nClick to copy`;
}

export function onCopyEvent(listener: (value: string) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ value?: string }>;
    if (typeof customEvent.detail?.value === "string") {
      listener(customEvent.detail.value);
    }
  };

  window.addEventListener(COPY_EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(COPY_EVENT_NAME, handler as EventListener);
}
