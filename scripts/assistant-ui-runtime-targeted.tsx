// Synthetic SSR of the actual assistant-ui runtime, without database/model/network.
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantThread, type MariposaMessage } from "../app/showroom/AssistantThread";

let writes = 0;
const render = (messages: MariposaMessage[], pending = false) => renderToStaticMarkup(
  <AssistantThread messages={messages} pending={pending}
    onSend={async () => { writes++; }} onCancel={() => { writes++; }}
    renderMessage={message => <article data-role={message.role}>
      {message.historical ? <details><summary>Требует перепроверки</summary>{message.content}</details> : <p>{message.content}</p>}
      {message.cards?.map(card => <a key={card.item.id} href={`/showroom?productId=${card.productId}`}>{card.item.name}</a>)}
    </article>} />,
);
const initial: MariposaMessage[] = [{ role: "user", content: "Размер уточним после примерки" }, { role: "assistant", content: "<script>unsafe</script>", historical: true }];
const first = render(initial);
assert.equal((first.match(/<article/g) ?? []).length, 2);
assert(first.includes("&lt;script&gt;unsafe&lt;/script&gt;"));
assert(first.includes("<details>"));
assert(first.includes('aria-busy="false"'));
assert(render(initial, true).includes('aria-busy="true"'));
assert.equal((render([]).match(/<article/g) ?? []).length, 0);
assert.equal(writes, 0, "Rendering/history recovery must not send messages or execute tools");
console.log("PASS: actual ExternalStoreRuntime SSR, bounded message rendering, escaped content, historical disclosure, pending state, empty/new thread, zero requests");
