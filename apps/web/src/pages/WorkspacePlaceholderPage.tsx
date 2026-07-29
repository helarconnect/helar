type WorkspacePlaceholderPageProps = {
  description: string;
  title: string;
};

export function WorkspacePlaceholderPage({ description, title }: WorkspacePlaceholderPageProps) {
  return (
    <div className="glass-panel p-10">
      <p className="eyebrow">Phase 1 workspace</p>
      <h2 className="mt-4 font-heading text-4xl text-white">{title}</h2>
      <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">{description}</p>
    </div>
  );
}
