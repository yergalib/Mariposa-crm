# iOS label printing candidate — 06.10.2026

Owner evidence: iPhone Safari renders the MP-R0071.ONE label, but the CRM
`Печатать · 1` button does nothing. Safari Share → Print works on that same page.
Printer setup is therefore not the explanation established by this incident.

The previous handler calls window.print synchronously; it has no awaits, popup,
iframe or auto-close. react-barcode creates the visible SVG in componentDidMount,
so the screenshot supports successful mounting, not a wholly unhydrated page.
The exact WebKit failure cannot be established without device instrumentation.

This is a bounded fallback, not a claim to have reproduced an iOS engine bug.
On iPhone/iPad the button synchronously opens a separate top-level document,
copies only the selected rendered labels/copies and inline SVG, installs local
A4 styles, closes the document stream and requests printing. No external assets,
fetch, iframe, async popup or React is needed in the new sheet. A native retry
button remains available if Safari suppresses the first call; the sheet is not
automatically closed. Blocked popups/unready barcodes produce an explicit error.
Desktop retains its existing current-window window.print path. Other document
printing is untouched. Product names remain DOM text; no untrusted HTML parsing.

Basis: WebKit's LocalDOMWindow::print defers while its document loader is loading,
and also suppresses printing under automation. A complete separate document
avoids dependence on the current streamed application's loader/state. That is
the fallback rationale, not proof that loading caused this owner's failure.
Source reviewed:
https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/LocalDOMWindow.cpp
(LocalDOMWindow::print).

Validation: `node scripts/label-print-targeted.cjs` — 6/6 PASS. Real SSR→React
hydration and SVG generation; selection/copy updates; unchanged desktop native
print; simulated iPhone/iPad routing; fresh document/native beforeprint and retry;
popup denial/unready-barcode handling; disabled empty selection; exact copy count
and hostile product text safety. Runs in installed Chrome on loopback with only
synthetic labels. iOS routing simulation is NOT WebKit or physical iPhone proof.
Targeted TypeScript, ESLint and diff checks PASS. No dependencies added.

Required device acceptance after a separately approved release: on the same
iPhone open labels, choose one label/one copy, tap CRM Print. Confirm a dedicated
sheet and system print preview; if the initial dialog is suppressed, tap the
sheet's Print Labels button. Verify the barcode and selected copies, cancel,
then confirm desktop still prints. Physical printer output is not yet verified.
Do not mark this fallback accepted on iPhone until the owner confirms it.
