/**
 * ComparisonKey — a one-line explainer of the three panels so a viewer
 * immediately understands what each one is and which pairs to compare.
 */
export function ComparisonKey() {
  return (
    <div className="cmpkey" aria-label="How to read the comparison">
      <span className="cmpkey__lead">One query → three systems.</span>
      <span className="cmpkey__pair"><b>①</b> current website</span>
      <span className="cmpkey__sep" aria-hidden="true">·</span>
      <span className="cmpkey__pair"><b>②</b> Ask AI quality floor</span>
      <span className="cmpkey__sep" aria-hidden="true">·</span>
      <span className="cmpkey__pair"><b>③</b> our optimized system</span>
    </div>
  );
}
