import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow">Not found</p>
      <h1 className="mt-4 font-heading text-5xl text-white">This legal learning route does not exist.</h1>
      <p className="mt-5 text-base leading-8 text-slate-300">
        Return to the Helar overview or jump into the student workspace demo.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Link className="button-primary" to="/">
          Back to overview
        </Link>
        <Link className="button-secondary" to="/app/dashboard">
          Open dashboard demo
        </Link>
      </div>
    </div>
  );
}
