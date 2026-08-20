import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useState } from "react";
import {
  ChatMessage,
  messageHasVisibleContent,
  type ResolveToolLabel,
} from "@/client/components/chat/ChatMessage";
import { useStickToBottom } from "@/client/components/chat/useStickToBottom";
import {
  ChatComposer,
  SuggestedQuestions,
  WelcomeMessage,
} from "./OnboardingChatParts";

// Friendly labels for each tool Sam can run, so the chat shows what it's doing
// rather than going silent while it gathers site data. `running` shows while the
// call is in flight; `done` stays as a persistent badge once it finishes.
const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  "tool-read_website": { running: "Reading site", done: "Read site" },
  "tool-get_seo_metrics": {
    running: "Getting SEO metrics",
    done: "SEO metrics",
  },
  "tool-research_keywords": {
    running: "Researching keywords",
    done: "Keyword research",
  },
  "tool-get_domain_overview": {
    running: "Analyzing domain",
    done: "Domain overview",
  },
  "tool-get_serp_results": {
    running: "Checking search results",
    done: "Search results",
  },
  "tool-find_serp_competitors": {
    running: "Finding competitors",
    done: "Competitors",
  },
  "tool-get_competitor_keywords": {
    running: "Analyzing competitor",
    done: "Competitor keywords",
  },
  "tool-get_backlinks_overview": {
    running: "Checking backlinks",
    done: "Backlinks overview",
  },
};

const resolveToolLabel: ResolveToolLabel = (partType) =>
  TOOL_LABELS[partType] ?? null;

const SUGGESTED_QUESTIONS = [
  "How will OpenSEO help me get more traffic?",
  "Compare OpenSEO and Claude",
  "How does the Google Search Console integration work?",
  "Right fit for consultants and agencies?",
];

const STRATEGY_SUGGESTION = "What do you recommend for my site?";
const COMPETITOR_SUGGESTION = "Compare against my competitors";
const PRIMARY_SUGGESTIONS = [STRATEGY_SUGGESTION, COMPETITOR_SUGGESTION];

export function OnboardingChatConversation({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const agent = useAgent({ agent: "onboarding-chat", name: projectId });
  const { messages, sendMessage, status } = useAgentChat({ agent });

  const [usedSuggestions, setUsedSuggestions] = useState<string[]>([]);
  const [strategyRequested, setStrategyRequested] = useState(false);

  const isBusy = status === "submitted" || status === "streaming";
  const { scrollRef, onScroll, pinToBottom } = useStickToBottom(
    messages,
    status,
  );
  const sendText = (text: string) => {
    pinToBottom();
    void sendMessage({ text });
  };

  const lastMessage = messages[messages.length - 1];
  const suggestionPool = [
    ...(strategyRequested ? [] : [STRATEGY_SUGGESTION]),
    COMPETITOR_SUGGESTION,
    ...SUGGESTED_QUESTIONS,
  ];
  const remainingSuggestions = suggestionPool.filter(
    (question) => !usedSuggestions.includes(question),
  );
  const showTyping =
    isBusy &&
    (lastMessage?.role !== "assistant" ||
      !messageHasVisibleContent(lastMessage));
  const showSuggestions =
    remainingSuggestions.length > 0 &&
    !isBusy &&
    (messages.length === 0 || lastMessage?.role === "assistant");

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-5 py-6"
        >
          <div className="mx-auto max-w-2xl space-y-6">
            <WelcomeMessage domain={domain} />

            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                resolveToolLabel={resolveToolLabel}
                streaming={
                  isBusy &&
                  index === messages.length - 1 &&
                  message.role === "assistant"
                }
              />
            ))}

            {showTyping ? (
              <div className="flex items-center gap-2 pt-1 text-base-content/40">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-current" />
                </span>
              </div>
            ) : null}

            {status === "error" ? (
              <p className="text-sm text-error">
                Something went wrong. Please refresh and try again.
              </p>
            ) : null}

            {showSuggestions ? (
              <SuggestedQuestions
                questions={remainingSuggestions}
                primaryQuestions={PRIMARY_SUGGESTIONS}
                onSelect={(question) => {
                  setUsedSuggestions((current) =>
                    current.includes(question)
                      ? current
                      : [...current, question],
                  );
                  if (question === STRATEGY_SUGGESTION) {
                    setStrategyRequested(true);
                  }
                  sendText(question);
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-base-300 px-5 py-3">
          <div className="mx-auto w-full max-w-2xl">
            <ChatComposer busy={isBusy} onSend={sendText} />
          </div>
        </div>
      </div>
    </div>
  );
}
