export default function ProtectedLoading() {
  return (
    <div className="page-shell route-loading-shell" aria-live="polite" aria-busy="true">
      <header className="page-header">
        <div>
          <span className="eyebrow">Opening</span>
          <h1>Loading</h1>
        </div>
      </header>
      <div className="route-loading-grid">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
