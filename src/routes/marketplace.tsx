import { createFileRoute } from '@tanstack/react-router'
import { MarketplaceScreen } from '@/screens/mccarthy/marketplace-screen'

export const Route = createFileRoute('/marketplace')({
  ssr: false,
  component: MarketplacePage,
})

function MarketplacePage() {
  return <MarketplaceScreen />
}
