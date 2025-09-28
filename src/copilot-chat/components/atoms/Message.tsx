import React, { useMemo } from "react";
import { concat, cx } from "../../../utils/style";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { usePlugin } from "../../hooks/usePlugin";
import { MessageData } from "../../store/slices/Message";

const BASE_CLASSNAME = "copilot-chat-message";

export interface MessageProps extends MessageData {
	className?: string;
	icon: string;
	name: string;
	// Add message for backwards compatibility with parent components that might still pass it.
	message?: string;
}

interface CodeProps {
	node?: unknown;
	className?: string;
	inline?: boolean;
	children?: React.ReactNode;
}

/**
 * Safely parses and pretty-prints a JSON string.
 * If the string is not valid JSON, it returns the original string.
 * @param jsonString The string to parse.
 * @returns A formatted JSON string or the original string.
 */
const prettyPrintJson = (jsonString: string | null): string => {
	if (jsonString === null || jsonString === undefined) {
		return "{}";
	}
	try {
		const parsed = JSON.parse(jsonString);
		return JSON.stringify(parsed, null, 2);
	} catch (e) {
		return jsonString; // Return original string if parsing fails
	}
};

const ChatMessage: React.FC<MessageProps> = (props) => {
	const {
		className,
		icon,
		name,
		content: contentFromData, // Renamed to avoid conflict
		linkedNotes,
		role,
		tool_calls,
		tool_call_id,
		message, // The old prop
	} = props;

	// Use the new `content` prop, but fall back to the old `message` prop for compatibility.
	const content = contentFromData ?? message;

	const plugin = usePlugin();
	const [isCopied, setIsCopied] = React.useState(false);

	const isDarkTheme = useMemo(() => {
		return document.body.classList.contains("theme-dark");
	}, [plugin?.app]);

	const handleCopyMessage = () => {
		navigator.clipboard
			.writeText(content || "")
			.then(() => {
				setIsCopied(true);
				setTimeout(() => {
					setIsCopied(false);
				}, 2000);
			})
			.catch((err) => {
				console.error("Failed to copy message: ", err);
			});
	};

	return (
		<div
			className={cx(concat(BASE_CLASSNAME, "container"), className || "")}
		>
			<div className={concat(BASE_CLASSNAME, "info")}>
				<div
					className={concat(BASE_CLASSNAME, "icon")}
					dangerouslySetInnerHTML={{ __html: icon }}
				/>
				<div className={concat(BASE_CLASSNAME, "name")}>{name}</div>
				<button
					className={concat(BASE_CLASSNAME, "copy-button")}
					onClick={handleCopyMessage}
					title={isCopied ? "Copied!" : "Copy message"}
					aria-label={isCopied ? "Copied!" : "Copy message"}
				>
					{isCopied ? (
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<polyline points="20 6 9 17 4 12"></polyline>
						</svg>
					) : (
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect
								x="9"
								y="9"
								width="13"
								height="13"
								rx="2"
								ry="2"
							></rect>
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
						</svg>
					)}
				</button>
			</div>
			<div className={concat(BASE_CLASSNAME, "message")}>
				{content !== null && content !== undefined && (
					<ReactMarkdown
						components={{
							p({ children }) {
								return (
									<p style={{ whiteSpace: "pre-wrap" }}>
										{children}
									</p>
								);
							},
							code({
								className,
								inline,
								children,
								...props
							}: CodeProps) {
								const match = /language-(\w+)/.exec(
									className || "",
								);
								return !inline && match ? (
									<SyntaxHighlighter
										language={match[1]}
										style={
											isDarkTheme
												? vscDarkPlus
												: (oneLight as Record<
														string,
														React.CSSProperties
													>)
										}
										PreTag="div"
										className={`theme-${
											isDarkTheme ? "dark" : "light"
										}`}
										customStyle={{
											background: "var(--code-background)",
											borderRadius: "4px",
										}}
										{...props}
									>
										{String(children || "").replace(/\n$/, "")}
									</SyntaxHighlighter>
								) : (
									<code className={className} {...props}>
										{children}
									</code>
								);
							},
						}}
					>
						{content}
					</ReactMarkdown>
				)}

				{role === "assistant" && tool_calls && tool_calls.length > 0 && (
					<div className="copilot-chat-tool-call">
						<p>🧠 Thinking... Using tool(s):</p>
						<ul>
							{tool_calls.map((call) => (
								<li key={call.id}>
									<code>{call.name}</code> with arguments:{" "}
									<code>{JSON.stringify(call.arguments)}</code>
								</li>
							))}
						</ul>
					</div>
				)}

				{role === "tool" && (
					<div className="copilot-chat-tool-result">
						<p>
							⚙️ Tool Result (<code>{tool_call_id}</code>):
						</p>
						<SyntaxHighlighter
							language="json"
							style={isDarkTheme ? vscDarkPlus : oneLight}
						>
							{content ? prettyPrintJson(content) : ""}
						</SyntaxHighlighter>

						{/* Allow copying tool output for further usage */}
						{content && (
							<button
								title="Copy Result"
								onClick={() =>
									navigator.clipboard.writeText(
										prettyPrintJson(content),
									)
								}
								className="copy-button-tool-result"
							>
								<span>📋</span>
							</button>
						)}
					</div>
				)}

				{linkedNotes && linkedNotes.length > 0 && (
					<div className={concat(BASE_CLASSNAME, "linked-notes")}>
						<div
							className={concat(
								BASE_CLASSNAME,
								"linked-notes-title",
							)}
						>
							Linked Notes:
						</div>
						<div
							className={concat(
								BASE_CLASSNAME,
								"linked-notes-list",
							)}
						>
							{linkedNotes.map((note, index) => (
								<div
									key={index}
									className={concat(
										BASE_CLASSNAME,
										"linked-note",
									)}
								>
									<span
										className={concat(
											BASE_CLASSNAME,
											"linked-note-filename",
										)}
									>
										[[{note.filename}]]
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default ChatMessage;
