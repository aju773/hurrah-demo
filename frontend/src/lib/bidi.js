// Unicode isolates: keep a left-to-right token (an order number, a file name, a
// phone number) in place inside an Arabic sentence without reordering the words
// around it. Used where the token is a message argument rather than its own element.
const LRI = "⁦";
const PDI = "⁩";

export function isolateLtr(text) {
  return `${LRI}${text}${PDI}`;
}
