export function adfToPlainText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;

  switch (node.type) {
    case "doc":
      return (node.content || []).map(adfToPlainText).join("\n\n");
    case "paragraph":
      return (node.content || []).map(adfToPlainText).join("");
    case "heading":
      return (node.content || []).map(adfToPlainText).join("");
    case "bulletList":
    case "orderedList":
      return (node.content || []).map(adfToPlainText).join("\n");
    case "listItem":
      return "- " + (node.content || []).map(adfToPlainText).join("\n");
    case "blockquote":
      return (node.content || []).map(adfToPlainText).join("\n");
    case "codeBlock":
      return (node.content || []).map(adfToPlainText).join("");
    case "text":
      return node.text || "";
    case "hardBreak":
      return "\n";
    case "mention":
      return `@${node.attrs?.text || node.attrs?.id || ""}`;
    case "inlineCard":
      return node.attrs?.url || "";
    case "table":
    case "tableRow":
    case "tableHeader":
    case "tableCell":
      return (node.content || []).map(adfToPlainText).join(" ");
    case "mediaSingle":
    case "media":
    case "rule":
      return "";
    default:
      if (node.content) {
        return (node.content || []).map(adfToPlainText).join("");
      }
      return node.text || "";
  }
}
