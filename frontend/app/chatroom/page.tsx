"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ルーム情報の型定義
interface RoomInfo {
  id: number;
  room_name: string;
  is_group: boolean;
}

export default function ChatRoomListPage() {
  // メニューの表示状態
  const [showMenu, setShowMenu] = useState(false);
  // グループルーム一覧
  const [groupRooms, setGroupRooms] = useState<RoomInfo[]>([]);
  // 各ルームの未読件数
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const router = useRouter();
  // WebSocket接続保持用
  const wsRef = useRef<WebSocket | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  // const mentionMapRef = useRef(mentionMap); // 🔁 绑定 ref
  const [roomNameToId, setRoomNameToId] = useState<Record<string, number>>({});


  // デモ用：一対一ルームの初期データ
  const oneToOneRooms = [{ label: "ルーム1", id: 1 }];
  // デフォルトのグループルーム名
  const defaultGroupNames = ["ルーム1", "ルーム2", "ルーム3"];

  // グループルームの一覧と未読件数を取得する非同期関数
  const fetchRoomsData = async () => {
    const res = await fetch("http://localhost:8081/rooms", { credentials: "include" });
    if (!res.ok) return;

    const rooms = await res.json();

    const groupRooms = rooms.filter(
      (r: any) => r.is_group && defaultGroupNames.includes(r.room_name)
    );
    setGroupRooms(groupRooms);

    const counts: Record<number, number> = {};
    const mapping: Record<string, number> = {};

    await Promise.all(
      groupRooms.map(async (room: any) => {
        mapping[room.room_name] = room.id;

        const unreadRes = await fetch(
          `http://localhost:8081/rooms/${room.id}/unread-count`,
          { credentials: "include" }
        );
        if (unreadRes.ok) {
          const data = await unreadRes.json();
          counts[room.id] = data.unread_count;
        }
      })
    );

    setUnreadCounts(counts);
    setRoomNameToId(mapping);
  };

  // メンション通知を取得して状態に反映する非同期関数
  const fetchMentionNotifications = async () => {
    try {
      const res = await fetch("http://localhost:8081/mention-notifications", { credentials: "include" });
      if (!res.ok) {
        router.push("/login");
        return; 
      }
      const data = await res.json();
      setMentionMap(data); 
    } catch (err) {
      console.error("❌ mention fetch error:", err);
    }
  };

  // デフォルトのグループルーム名をクリックしたときの処理（存在すれば移動、なければ新規作成）
  const handleDefaultGroupClick = async (roomName: string) => {
    let existing = groupRooms.find((r) => r.room_name === roomName);
    if (existing) {
      setUnreadCounts((prev) => ({ ...prev, [existing.id]: 0 }));
      router.push(`/chatroom/group?room_id=${existing.id}`);
      return;
    } else {
      const res = await fetch("http://localhost:8081/create-group-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ room_name: roomName, user_ids: [] }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/chatroom/group?room_id=${data.room_id}`);
      } else {
        alert("グループ作成に失敗しました");
      }
    }
  };

  // 新しいグループルームを作成する処理 未使用
  // const handleNewGroupClick = async () => {
  //   const nextIndex = groupRooms.length + 1;
  //   const newName = `ルーム${nextIndex + 3}`;

  //   const res = await fetch("http://localhost:8081/create-group-room", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     credentials: "include",
  //     body: JSON.stringify({ room_name: newName, user_ids: [] }),
  //   });

  //   if (res.ok) {
  //     const data = await res.json();
  //     router.push(`/chatroom/${data.room_id}/group`);
  //   } else {
  //     alert("グループ作成に失敗しました");
  //   }
  // };

  // 任意のルーム（グループまたは一対一）をクリックしたときに遷移する処理
  const handleRoomClick = (roomId: number) => {
    const room = groupRooms.find((r) => r.id === roomId);
    if (room && room.is_group) {
      router.push(`/chatroom/group?room_id=${room.id}`);
    } else {
      router.push(`/chatroom/${roomId}`);
    }
  };
  
  // ログイン中のユーザーを確認（未ログインならリダイレクト）
  useEffect(() => {
    fetch("http://localhost:8081/me", { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.username) {
          console.log("✅ ログイン中ユーザー:", data.username);
        }
        if (data?.user_id) {
          setCurrentUserId(data.user_id);
        }
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  
  // 定期的にルーム・未読数を更新
  useEffect(() => {
    fetchRoomsData();
    fetchMentionNotifications();
  }, []);

  // WebSocket接続管理（ホームルーム ID 0）
  useEffect(() => {
    if (currentUserId === null) return;

    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket("ws://localhost:8081/ws?room_id=0");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket 接続成功（ホーム）");
    };

    ws.onmessage = (event) => {
      // console.log("📩 WebSocket メッセージ（ホーム）:", event.data); // テスト用

      const parsed = JSON.parse(event.data);
      // console.log("📩 WebSocket parsed（ホーム）:", parsed); // テスト用

      if (
        parsed.type === "mention_notify" &&
        currentUserId !== null &&
        String(parsed.to_user) === String(currentUserId)
      ) {
        const roomId = String(parsed.room_id);
        const from = parsed.from;
        setMentionMap(prev => ({ ...prev, [roomId]: from }));
        return;
      }

      if (parsed.type === "unread_update") {
        const unreadMap = parsed.unread_map || {};
        const roomId = parsed.room_id;

        //  現在のユーザーが map に含まれている場合のみ更新する
        if (unreadMap[currentUserId] !== undefined) {
          const count = unreadMap[currentUserId];
          setUnreadCounts(prev => ({ ...prev, [roomId]: count }));
        }
      }
    }
    ws.onclose = () => {
      console.log("🔌 WebSocket 切断（ホーム）");
    };
    return () => ws.close();
  }, [currentUserId]);

  return (
    <div className="h-screen flex flex-col">
      {/* ヘッダー */}
      <div className="relative bg-white p-4 border-b shadow-sm h-20 flex items-center justify-center" style={{ backgroundColor: "#f5fffa" }}>
      {/* ← 戻るボタン（ログイン画面へ） */}
      <button
        onClick={() => router.push("/login")}
        className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#2e8b57] hover:text-green-800 transition"
        aria-label="Back to Login"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <h2 className="text-lg text-[#2e8b57] font-semibold">チャットルーム一覧</h2>

      {/* 右側のメニュー保持（不用改） */}
      <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
        <img
          src="/window.svg"
          alt="My Avatar"
          className="w-8 h-8 rounded-full cursor-pointer"
          onClick={() => setShowMenu((prev) => !prev)}
        />
        {showMenu && (
          <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow-lg z-10">
            <button onClick={() => router.push("/")} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">ホームページ</button>
            <button
              onClick={() => router.push("/login")}
              className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-500"
            >
              ログアウト
            </button>
          </div>
        )}
      </div>
    </div>

      {/* ルーム一覧 */}
      <div className="flex-1 flex p-6 bg-white overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto">
          {/* 一対一チャットセクション */}
          <h3 className="text-lg text-[#2e8b57] font-bold mb-2">一対一</h3>
          <div className="bg-gray-100 rounded p-4 shadow mb-6" style={{ backgroundColor: "#2e8b57" }}>
            <h4 className="text-md font-semibold text-white mb-3">一対一ルーム</h4>
            <ul className="space-y-3">
              {oneToOneRooms.map((room) => (
                <li
                  key={room.id}
                  onClick={() => handleRoomClick(room.id)}
                  className="p-4 bg-white rounded shadow hover:bg-gray-200 cursor-pointer text-[#2e8b57]"
                >
                  {room.label}
                </li>
              ))}
            </ul>
          </div>

          {/* グループチャットセクション */}
          <h3 className="text-lg text-[#2e8b57] font-bold mb-2">グループ</h3>
          <div className="bg-gray-100 rounded p-4 shadow" style={{ backgroundColor: "#2e8b57" }}>
            <h4 className="text-md font-semibold text-white mb-3 flex justify-between items-center">
              グループルーム
              {/* <button
                onClick={handleNewGroupClick}
                className="bg-white text-[#2e8b57] px-2 py-1 text-sm rounded shadow hover:bg-gray-100"
              >
                + 新規作成
              </button> */}
            </h4>
            <ul className="space-y-3">
              {defaultGroupNames.map((name) => {
                const roomId = roomNameToId[name]; 
                const hasUnread = roomId !== undefined && (unreadCounts[roomId] ?? 0) > 0;
                const mentionUser = roomId !== undefined ? mentionMap[String(roomId)] : null;
                return (
                  <li
                    key={name}
                    onClick={() => handleDefaultGroupClick(name)}
                    className="relative p-4 bg-white rounded shadow hover:bg-gray-200 cursor-pointer text-[#2e8b57]"
                  >
                    {name}
                    {hasUnread && (
                      <span className="absolute top-1 right-2 bg-red-500 text-white text-[13px] font-bold px-2 h-[20px] leading-[20px] rounded-[10px] shadow-sm min-w-[26px] text-center">
                        {unreadCounts[roomId] > 99 ? "99+" : unreadCounts[roomId]}
                      </span>
                    )}
                    {mentionUser && (
                      <span className="block text-yellow-700 text-xs mt-1">
                        🔔 {mentionUser} さんがあなたをメンション
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}