import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import useDialogA11y from "./useDialogA11y";

afterEach(cleanup);

// jsdom has no layout, so every element would count as hidden.
Element.prototype.getClientRects = function () {
  return [{}];
};

function Dialog({ onClose, closeOnEscape = true, label = "one", children }) {
  const ref = useRef(null);
  useDialogA11y(ref, { onClose, closeOnEscape });
  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1}>
      <button>{label}-first</button>
      {children}
      <button>{label}-last</button>
    </div>
  );
}

function Harness({ onClose = () => {}, ...rest }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && (
        <Dialog
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          {...rest}
        />
      )}
    </div>
  );
}

describe("useDialogA11y", () => {
  it("moves focus into the dialog and gives it back to the opener on close", () => {
    render(<Harness />);
    const opener = screen.getByText("opener");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab and Shift+Tab inside the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("opener"));
    const first = screen.getByText("one-first");
    const last = screen.getByText("one-last");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("pulls stray focus back in on Tab", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("opener"));
    screen.getByText("opener").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("one-first"));
  });

  it("does not close on Escape when closing is not allowed", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} closeOnEscape={false} />);
    fireEvent.click(screen.getByText("opener"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("lets only the innermost (latest opened) dialog take Escape", () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    function Nested() {
      const [inner, setInner] = useState(false);
      return (
        <Dialog onClose={outerClose} label="outer">
          <button onClick={() => setInner(true)}>open inner</button>
          {inner && <Dialog onClose={innerClose} label="inner" />}
        </Dialog>
      );
    }
    render(<Nested />);
    fireEvent.click(screen.getByText("open inner"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });
});
