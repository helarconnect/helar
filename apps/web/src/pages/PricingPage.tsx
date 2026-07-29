import { useQuery } from "@tanstack/react-query";

import { PricingCard } from "@/components/ui/PricingCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { fetchSubscriptionPlans } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function PricingPage() {
  const pricingQuery = useQuery({
    queryKey: queryKeys.subscriptionPlans,
    queryFn: fetchSubscriptionPlans
  });

  return (
    <div className="section-shell space-y-12 pb-24 pt-12">
      <div className="section-cream space-y-10">
        <SectionHeading
          align="center"
          body="Choose the Paystack-backed Helar subscription that matches your study horizon: monthly at NGN 2,000, 6 months at NGN 11,000, or 1 year at NGN 22,000, all usable on up to 3 devices."
          eyebrow="Subscription billing"
          title="Simple legal learning plans priced in naira."
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {pricingQuery.data?.map((plan, index) => (
            <PricingCard
              actionLabel="Subscribe"
              featured={plan.code === "annual" || index === 1}
              key={plan.code}
              plan={plan}
              to={`/app/subscription?plan=${plan.code}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
