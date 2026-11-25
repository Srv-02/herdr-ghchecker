import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// GPUI (gpui-pre 0.3.8, div.rs) notifies the view of a hover change only through the element's hover state, and an
// element has that state only with an identity. A row of the virtual list without .id() kept its old look until some
// other repaint came along, so the hover background showed late. The rows must carry their key as id.
test("every row of the virtual list carries its key as element id", () => {
  const src = fs.readFileSync(new URL("../mods/ghchecker/main.js", import.meta.url), "utf8");
  const call = src.match(/v_virtual_list\(id,[\s\S]*?\.on_item_click\(/);
  assert.ok(call, "list() draws through v_virtual_list with on_item_click");
  assert.match(call[0], /\.draw\(x\.size\)\.id\(x\.key\)/);
});
