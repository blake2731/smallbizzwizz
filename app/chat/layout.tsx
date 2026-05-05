import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  if (!user?.publicMetadata?.subscribed) {
    redirect('/subscribe')
  }

  return <>{children}</>
}
