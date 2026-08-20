import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";

const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";

export function SuggestedQuestions({
  questions,
  primaryQuestions = [],
  onSelect,
}: {
  questions: string[];
  primaryQuestions?: string[];
  onSelect: (question: string) => void;
}) {
  return (
    <div className="ml-10 flex flex-wrap gap-2">
      {questions.map((question) =>
        primaryQuestions.includes(question) ? (
          <button
            key={question}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            onClick={() => onSelect(question)}
          >
            <Sparkles className="size-3.5" />
            {question}
          </button>
        ) : (
          <button
            key={question}
            type="button"
            className="rounded-full border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content/70 transition-colors hover:border-primary/50 hover:text-base-content"
            onClick={() => onSelect(question)}
          >
            {question}
          </button>
        ),
      )}
    </div>
  );
}

export function WelcomeMessage({ domain }: { domain: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3 pt-0.5 text-sm">
        <div className="space-y-3 text-base-content/80">
          <p>Hey, I’m Sam — welcome to OpenSEO.</p>
          <p>
            You can also{" "}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noreferrer"
              className="link link-primary"
            >
              join the Discord
            </a>{" "}
            or email{" "}
            <a href="mailto:ben@openseo.so" className="link link-primary">
              ben@openseo.so
            </a>{" "}
            if you have any questions I can’t help you with.
          </p>
          <p>
            Want me to analyze{" "}
            <span className="font-medium text-base-content">{domain}</span> and
            draft a strategy, or do you have questions first? Pick one below to
            get started.
          </p>
        </div>
      </div>
    </div>
  );
}

// Kept for imports that still reference the upgrade rail; personal deployments
// do not show a paywall during onboarding.
export function UpgradeSidebar(_props: {
  domain: string;
  questionsUsed: number;
  isStartingCheckout: boolean;
  onUpgrade: () => void;
}) {
  return null;
}

export function ChatGate(_props: {
  isStartingCheckout: boolean;
  onUpgrade: () => void;
}) {
  return null;
}

export function ChatComposer({
  busy,
  onSend,
  placeholder = "Ask Sam about your strategy or OpenSEO…",
}: {
  busy: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a few lines, then scroll. Resetting height to
  // `auto` first lets it shrink as well as grow.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-box border border-base-300 bg-base-100 px-3 py-2 focus-within:border-primary"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKey}
        rows={1}
        placeholder={placeholder}
        className="max-h-40 flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-relaxed outline-none placeholder:text-base-content/50 focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Send message"
        disabled={busy || !value.trim()}
        className="btn btn-primary btn-circle btn-sm"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ArrowUp className="size-4" />
        )}
      </button>
    </form>
  );
}
