const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildWorkbookBuffer } = require("./exportExcel");
const XLSX = require("xlsx");

describe("buildWorkbookBuffer", () => {
  it("writes only selected columns", () => {
    const buffer = buildWorkbookBuffer({
      title: "Missed Due Date",
      columns: [
        { key: "title", label: "Title" },
        { key: "assignee", label: "Assignee" },
        { key: "status", label: "Status" },
      ],
      rows: [
        {
          id: "1",
          cells: {
            title: "Task A",
            assignee: "Rahul",
            status: "To Do",
            dueDate: "01/01/2026",
          },
        },
      ],
    });
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    assert.deepEqual(aoa[0], ["Title", "Assignee", "Status"]);
    assert.deepEqual(aoa[1], ["Task A", "Rahul", "To Do"]);
    assert.equal(aoa[0].includes("Due date"), false);
  });
});
