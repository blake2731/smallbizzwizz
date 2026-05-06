export const BUSINESS_CONTEXTS: Record<string, string> = {
  retail: `This user runs a retail business or boutique. Background to fold into answers when relevant:
- Healthy gross margins run 40-55%; net is usually 5-10% after rent and labor
- Q4 (Nov-Dec) often makes the year — slow Q1/Q2 is normal, not a crisis
- Inventory turn is the metric; dead stock and markdowns silently kill margin
- Supplier reality: MOQs, Net 30/60 terms, dishonest wholesale platforms, knock-offs
- Most successful boutiques now run both physical + Shopify/Square; ignoring online is a slow death
- Returns and exchanges are a margin destroyer if policy isn't tight`,

  restaurant: `This user runs a restaurant or food service business. Background to fold into answers when relevant:
- Food cost target 28-35% of revenue, labor 25-35%; "prime cost" combined should stay under 60%
- Net margins are razor-thin — 5-10% is healthy for an independent
- Cash flow rhythm is brutal: rent and payroll hit before inventory turns
- Third-party delivery (DoorDash, Uber Eats) takes 15-30% — usually a customer-acquisition tool, not a profit center
- No-shows on reservations, ghost-kitchen competition, and turnover are the chronic pains
- Repeat traffic and average ticket beat new-customer hunting`,

  freelancer: `This user is a freelancer or solo professional. Background to fold into answers when relevant:
- Hourly billing leaves money on the table for valuable work — project or value-based pricing is usually better
- Rule of thumb: charge 2-3× what you'd want to earn as a salaried equivalent (covers taxes, downtime, benefits, no PTO)
- Contracts must include: scope, kill fee, late payment terms (1.5%/month is standard), IP/usage rights
- Client concentration risk: no single client should be more than 30% of revenue
- Quarterly estimated taxes and ~15.3% self-employment tax catch new freelancers off guard
- Pipeline beats current work — always be filling the top of the funnel`,

  contractor: `This user is a contractor or trades professional. Background to fold into answers when relevant:
- Job costing is everything — track materials, labor, and overhead per job, not just gross revenue
- Deposit (30-50% up front) plus progress payments is the cash-flow lifeline
- Get change orders in writing every time; verbal "small extras" are the #1 source of disputes
- Insurance basics: general liability is mandatory, workers' comp if employees, commercial auto for trucks
- Lien rights and lien waivers protect you when clients drag payment
- Material lead times are volatile — build buffer into quotes, don't eat the delta`,

  ecommerce: `This user runs an e-commerce business. Background to fold into answers when relevant:
- Unit economics: CAC vs LTV is the game; if CAC exceeds 30% of first-order LTV, the model is broken
- Margins must absorb COGS, shipping, returns (5-30%), payment processing (~3%), platform fees, and ad spend
- Holding inventory ties up cash — drop-ship is a useful way to test SKUs before committing capital
- Track ROAS per channel (Meta, Google, TikTok) separately; blended numbers hide the loser
- Product page conversion lives or dies on reviews and social proof
- Returns policy is a positioning lever, not just a cost line`,

  service: `This user runs a service business or agency. Background to fold into answers when relevant:
- Revenue model: bill rate × utilization × team size; healthy utilization is 65-75%
- Productized services (fixed scope, fixed price) usually beat pure custom on margin
- Retainers smooth revenue but become hostage situations when scope drifts
- Written SOWs and change orders are non-negotiable — scope creep is the #1 profit killer
- Referrals are 2-3× more profitable than paid acquisition; protect them
- Don't hire ahead of revenue; hire slightly behind it and work weekends until stable`,
}
