import {
	DidChangeTextDocumentParams,
	DidOpenTextDocumentParams,
	GetCompletionsParams,
} from "@pierrad/ts-lsp-client";

class LSP {
	public static createDidOpenParams(args: {
		uri: string;
		version: number;
		text: string;
	}): DidOpenTextDocumentParams {
		return {
			textDocument: {
				uri: "file://" + args.uri,
				languageId: "markdown",
				version: args.version,
				text: args.text,
			},
		};
	}

	public static createDidChangeParams(args: {
		uri: string;
		version: number;
		text: string;
	}): DidChangeTextDocumentParams {
		return {
			textDocument: {
				uri: "file://" + args.uri,
				version: args.version,
			},
			contentChanges: [
				{
					text: args.text,
				},
			],
		};
	}

	public static createCompletionParams(args: {
		uri: string;
		relativePath: string;
		line: number;
		character: number;
		version: number;
		indentSize?: number;
	}): GetCompletionsParams {
		return {
			doc: {
				tabSize: 2,
				indentSize: args.indentSize || 4,
				insertSpaces: false,
				uri: "file://" + args.uri,
				relativePath: args.relativePath,
				position: {
					line: args.line,
					character: args.character,
				},
				version: args.version,
			},
		};
	}
}

export default LSP;
