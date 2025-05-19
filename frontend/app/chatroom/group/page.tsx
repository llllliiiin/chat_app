'use client'

import { Suspense } from "react"
import GroupChatRoomContent from "./GroupChatRoomContent"

export default function Page() {
  return (
    <Suspense fallback={<div>読み込み中...</div>}>
      <GroupChatRoomContent />
    </Suspense>
  )
}