// "use client" を必ず含める
"use client";
import EmojiPicker from 'emoji-picker-react';
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import MessageItem from "./components/MessageItem";

interface RoomInfo {
  id: number;
  room_name: string;
  is_group: boolean;
}

export default function UserPage() {
  const [showMenu, setShowMenu] = useState(false);
  const router = useRouter();
  const { roomId, userId } = useParams();

  const [users, setUsers] = useState<string[]>([]);
  const [message, setMessage] = useState(""); 
  const [messages, setMessages] = useState<{ id: number; content: string; sender: string; readers?: string[];thread_root_id?: number | null; attachment?: string }[]>([]);

  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageReads, setMessageReads] = useState<Record<number, string[]>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [groupRooms, setGroupRooms] = useState<RoomInfo[]>([]);
  const [userToRoomIdMap, setUserToRoomIdMap] = useState<Record<string, number>>({});
  const [webSocketStatus, setWebSocketStatus] = useState<string>("undefined");
  const wsRef = useRef<WebSocket | null>(null); 
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [actionBoxVisible, setActionBoxVisible] = useState<number | null>(null);
  const actionBoxRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const [messageReactions, setMessageReactions] = useState<Record<number, { emoji: string; users: string[] }[]>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
   
  const [replyTo, setReplyTo] = useState<{id: number; content: string; sender: string; thread_root_id?: number; attachment?: string;} | null>(null);
  
  //  メッセージの既読ユーザーを取得する非同期関数
  const fetchReads = async () => {
    const result: Record<number, string[]> = {};
    try {
      for (const msg of messages) {
        const res = await fetch(`http://localhost:8081/messages/${msg.id}/readers`, {
          credentials: "include",
        });
        const data = await res.json();
        result[msg.id] = data.readers || [];
      }
      setMessageReads(result);
    } catch (err) {
      console.error("既読データ取得失敗", err);
    }
  };

  // ルーム一覧と未読数を取得する関数
  const fetchRoomsAndUnreadCounts = async () => {
    const res = await fetch("http://localhost:8081/oneroom", {
      credentials: "include",
    });

    if (!res.ok) throw new Error("ルーム取得失敗");
    const allRooms: RoomInfo[] = await res.json();
    if (!Array.isArray(allRooms)) return;

    const matchedRooms = allRooms.filter((room) => room.is_group === false);
    setGroupRooms(matchedRooms);

    const newUserToRoomIdMap: Record<string, number> = {};

    for (const room of matchedRooms) {
      if (!room.room_name.includes("_") || !currentUser) continue;
      const parts = room.room_name.split("_"); 
      const me = currentUser;
      const otherUser = parts.find((name) => name !== me);
      if (otherUser) {
        newUserToRoomIdMap[otherUser] = room.id;
      }
    }
    // console.log("✅ userToRoomIdMap 正確建立 =", newUserToRoomIdMap);
    setUserToRoomIdMap(newUserToRoomIdMap);

    // 各ルームの未読数を取得
    const counts: Record<string, number> = {};
    for (const room of matchedRooms) {
      const res = await fetch(`http://localhost:8081/rooms/${room.id}/unread-count`, {
        credentials: "include",
      });
      const data = await res.json();
      counts[room.id] = data.unread_count;
    }
    setUnreadCounts(counts);
    console.log(counts);
  };

  // 絵文字リアクションを送信する関数
  const handleReaction = async (targetMessageId: number, emoji: string) => {
    await fetch("http://localhost:8081/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        room_id: parseInt(roomId as string),
        content: `reaction:${emoji}:${targetMessageId}`,
        thread_root_id: null,
        mentions: [],
      }),
    });
  };

  // ユーザーをクリックしたらルーム作成して遷移
  const handleUserClick = async (targetUser: string) => {
    const res = await fetch("http://localhost:8081/get-or-create-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ user1: currentUser, user2: targetUser }),
    });

    const data = await res.json();
    const actualRoomId = data.room_id;

    await fetch(`http://localhost:8081/rooms/${actualRoomId}/enter`, {
      method: "POST",
      credentials: "include",
    });

    setUnreadCounts((prev) => ({ ...prev, [data.room_id]: 0 }));
    router.push(`/chatroom/${data.room_id}/${targetUser}`);
  };

  // メッセージ送信処理
  const handleSend = async () => {
    const parsedRoomId = parseInt(roomId as string, 10);
    if (!message.trim()) return;
    if (!roomId || isNaN(parsedRoomId) || parsedRoomId <= 0) {
      alert("無効なルームIDです");
      return;
    }

    try {
      await fetch("http://localhost:8081/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          room_id: parsedRoomId,
          content: message,
          thread_root_id: replyTo?.id ?? null, 
        }),
      });
      setMessage("");
      setReplyTo(null);
      setTimeout(() => {
        fetchReads();
      }, 300);
    } catch (err) {
      alert("送信失敗");
    }
  };

   // メッセージ撤回
  const handleRevoke = async (msgId: number) => {
    const res = await fetch(`http://localhost:8081/messages/${msgId}/revoke`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      setMessages(prev => prev.filter(m => m.id !== msgId));
      actionBoxRefs.current.delete(msgId); 
    } else {
      alert("撤回に失敗しました（2分以上経過した可能性があります）");
    }
  };

  // メッセージ非表示
  const handleHide = async (msgId: number) => {
    const res = await fetch(`http://localhost:8081/messages/${msgId}/hide`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      setMessages(prev => prev.filter(m => m.id !== msgId));
      actionBoxRefs.current.delete(msgId); 
    } else {
      alert("削除に失敗しました");
    }
  };

  // 画像アップロード処理
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;

    const reader = new FileReader();
    reader.onload = () => setPreviewImage(reader.result as string);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("room_id", roomId.toString());
    formData.append("type", "image");

    await fetch("http://localhost:8081/messages/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    setPreviewImage(null);
  };

  //ファイルアップロード処理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("room_id", roomId.toString());
    formData.append("type", "file");

    await fetch("http://localhost:8081/messages/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  };

  // 初期化：ログインチェック & ユーザー一覧の取得
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
          setCurrentUser(data.username);
          setCurrentUserId(data.user_id);
          fetch("http://localhost:8081/users", { credentials: "include" })
            .then(async (res) => {
              if (!res.ok) throw new Error(await res.text());
              return res.json();
            })
            .then((data: { users: string[] }) => {
              setUsers(data.users);
              setChecking(false);
            })
            .catch((err) => {
              console.error("ユーザー取得失敗：", err);
              setError(err.message || "読み込み失敗");
              setChecking(false);
            });
        }
      });
  }, [router]);

  // 入室通知を送信（WebSocketが接続されてから）
  useEffect(() => {
    if (!roomId || !currentUser) return;

    const tryEnter = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        fetch(`http://localhost:8081/rooms/${roomId}/enter`, {
          method: "POST",
          credentials: "include",
        });
      } else {
        setTimeout(tryEnter, 100); // 接続待ち
      }
    };
    tryEnter();
  }, [roomId, currentUser]);


  // メインWebSocket処理（メッセージやリアクションなど）
  useEffect(() => {
    if (!roomId || !currentUser) return;

    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`ws://localhost:8081/ws?room_id=${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket 接続成功");
      setWebSocketStatus("connected");
    };

    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);

      if (parsed.type === "message_revoked" && parsed.message_id) {
        setMessages((prev) => prev.filter((m) => m.id !== parsed.message_id));
      }

      if (parsed.type === "read_update" && parsed.message_id) {
        setMessageReads((prev) => ({
          ...prev,
          [parsed.message_id]: parsed.readers || [],
        }));
      }

      if (parsed.type === "new_message" && parsed.message) {
        const msg = parsed.message;
        const content = msg.content || "";

        // 内容が "reaction:" で始まる場合、それはリアクションです。
        if (content.startsWith("reaction:")) {
          const [, emoji, targetIdStr] = content.split(":");
          const targetId = parseInt(targetIdStr);
          const sender = msg.sender;

          setMessageReactions((prev) => {
            const oldList = prev[targetId] || [];
            // このユーザーがつけたすべてのリアクションを削除します
            const cleaned = oldList.map((r) => ({
              ...r,
              users: r.users.filter((u) => u !== sender),
            })).filter((r) => r.users.length > 0);

            // もしユーザーがすでに同じ絵文字を付けていれば、今回のクリックは「取り消し」とみなされます。
            const hadSameEmojiBefore = oldList.some((r) => r.emoji === emoji && r.users.includes(sender));
            //キャンセルの場合は追加しません。それ以外なら、絵文字にこのユーザーを追加します。
            if (hadSameEmojiBefore) {
              return { ...prev, [targetId]: cleaned };
            } else {
              const updatedEmoji = cleaned.find((r) => r.emoji === emoji);
              if (updatedEmoji) {
                updatedEmoji.users.push(sender);
              } else {
                cleaned.push({ emoji, users: [sender] });
              }
              return { ...prev, [targetId]: cleaned };
            }
          });

          return; 
        }


        setMessages((prev) => {
          const newMessages = [...prev];

          // スレッド返信（引用）の場合、親メッセージが存在しなければ parent_message を追加します。
          if (msg.thread_root_id) {
            const hasParent = prev.some((m) => m.id === msg.thread_root_id);

            // スレッド返信（引用）の場合、親メッセージが存在しなければ parent_message を追加します。
            if (!hasParent && parsed.parent_message) {
              newMessages.push({
                id: parsed.parent_message.id,
                sender: parsed.parent_message.sender,
                content: parsed.parent_message.content,
                thread_root_id: parsed.parent_message.thread_root_id,
                attachment: parsed.parent_message.attachment || undefined,
              });
            }

            if (!hasParent && !parsed.parent_message) {
              fetch(`http://localhost:8081/messages/${msg.thread_root_id}`, {
                credentials: "include",
              })
                .then((res) => res.json())
                .then((parentMsg) => {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: parentMsg.id,
                      sender: parentMsg.sender,
                      content: parentMsg.content,
                      thread_root_id: parentMsg.thread_root_id,
                      attachment: parentMsg.attachment || undefined,
                    },
                  ]);
                });
            }
          }
          newMessages.push({
            id: msg.id,
            sender: msg.sender,
            content: msg.content,
            thread_root_id: msg.thread_root_id,
            attachment: msg.attachment || undefined,
          });

          return newMessages;
        });
      }
    };

    ws.onerror = (event) => {
      console.error("❌ WebSocket エラー", event);
      setWebSocketStatus("error");
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket 切断");
      setWebSocketStatus("closed");
    };

    return () => {
      ws.close();
    };
  }, [roomId, currentUser]);


  // 左側全体未読追踪用WebSocket
  useEffect(() => {
    if (currentUserId === null) return;
    const ws = new WebSocket("ws://localhost:8081/ws?room_id=0");

    ws.onopen = () => {
      console.log("✅ WebSocket 接続成功 (左側)");
      ws.send(JSON.stringify({ ping: true }));
    };

    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      // console.log("📩 WebSocket 收到:", parsed);

      if (
        parsed.type === "unread_update" &&
        parsed.unread_map &&
        parsed.room_id !== undefined &&
        currentUserId !== null
      ) {
        const count = parsed.unread_map[currentUserId];

        if (typeof count === "number") {
          // console.log("✅ 更新 unreadCounts:", parsed.room_id, "=>", count);
          setUnreadCounts((prev) => ({
            ...prev,
            [parsed.room_id]: count,
          }));
        } else {
          console.warn("⚠️ ユーザーはunread_mapの中ではない ");
        }
      }
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket エラー：", err);
    };

    ws.onclose = () => {
      console.warn("🔌 WebSocket 断开 (左側)");
    };

    return () => ws.close();
  }, [currentUserId]);

  // スクロール自動追尾
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // メッセージ読取処理 + 既読/未読情報更新
  useEffect(() => {
    if (!messages || !currentUser) return;
    messages.forEach((msg) => {
      if (msg.sender !== currentUser) {
        fetch(`http://localhost:8081/messages/${msg.id}/markread`, {
          method: "POST",
          credentials: "include",
        }).catch((err) => console.error("既読マーク失敗", err));
      }
    });
    setTimeout(() => {
      fetchReads();
      fetchRoomsAndUnreadCounts();
    }, 300);
  }, [messages, currentUser]);

  // 初回メッセージ取得 + reaction 構造化
  useEffect(() => {
    if (!roomId || !currentUser) return;
    fetch(`http://localhost:8081/messages?room_id=${roomId}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        const rawMessages = data.messages || [];
        const normalMessages: typeof messages = [];
        const userEmojiMap: { [messageId: number]: { [user: string]: string } } = {};
        const reactionMap: {
          [messageId: number]: {
            [emoji: string]: string[]; // emoji → users[]
          };
        } = {};

        for (const m of rawMessages) {
          if (m.content?.startsWith("reaction:")) {
            const [, emoji, targetIdStr] = m.content.split(":");
            const targetId = parseInt(targetIdStr);

            if (!reactionMap[targetId]) {
              reactionMap[targetId] = {};
            }

            if (!userEmojiMap[targetId]) {
              userEmojiMap[targetId] = {};
            }

            const previousEmoji = userEmojiMap[targetId][m.sender];

            if (previousEmoji === emoji) {
              reactionMap[targetId][emoji] = reactionMap[targetId][emoji]?.filter((u) => u !== m.sender);
              delete userEmojiMap[targetId][m.sender];
            } else {
              if (previousEmoji) {
                reactionMap[targetId][previousEmoji] = reactionMap[targetId][previousEmoji]?.filter((u) => u !== m.sender);
              }

              if (!reactionMap[targetId][emoji]) {
                reactionMap[targetId][emoji] = [];
              }
              reactionMap[targetId][emoji].push(m.sender);
              userEmojiMap[targetId][m.sender] = emoji;
            }
          } else {
            normalMessages.push({
              id: m.id,
              content: m.content,
              sender: m.sender,
              thread_root_id: m.thread_root_id,
              attachment: m.attachment || undefined,
            });
          }
        }
        setMessages(normalMessages);

        const structured: typeof messageReactions = {};
        for (const [msgIdStr, emojiGroup] of Object.entries(reactionMap)) {
          const msgId = parseInt(msgIdStr);
          structured[msgId] = Object.entries(emojiGroup).map(([emoji, users]) => ({
            emoji,
            users,
          }));
        }
        setMessageReactions(structured);
      });

  }, [roomId, currentUser]);



   //  一定間隔で未読数とルーム状態を更新
  useEffect(() => {
    if (!currentUser) {
      console.warn("⚠️ currentUser 為 null，跳過 fetchRoomsAndUnreadCounts 初始化");
      return;
    }
    fetchRoomsAndUnreadCounts(); 
    const interval = setInterval(() => {
      if (currentUser) {
        fetchRoomsAndUnreadCounts(); 
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser]); 
  

  // 外部クリックでアクションメニュー閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      for (const [, ref] of actionBoxRefs.current) {
        if (ref && ref.contains(target)) {
          return; 
        }
      }
      setActionBoxVisible(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (checking) {
    return <div className="h-screen flex justify-center items-center">Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* 共通ヘッダー */}
      <div
        className="relative flex justify-center items-center bg-white p-4 border-b shadow-sm h-20"
        style={{ backgroundColor: "#f5fffa" }}
      >
        {/* ← 戻るボタン（チャットルーム一覧へ） */}
        <button
          onClick={() => router.push("/chatroom")}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#2e8b57] hover:text-green-800 transition"
          aria-label="Back to Room List"
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

        <h2 className="text-lg text-[#2e8b57] font-semibold">LINECHAT</h2>

        {/* 右側メニューアイコンそのまま保留 */}
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


      <div className="flex-1 flex min-h-0">
        {/* ユーザー一覧 */}
        <div className="w-1/4 p-4 flex flex-col min-h-0" style={{ backgroundColor: "#2e8b57" }}>
          <h2 className="text-xl text-white font-bold mb-4 text-center">ユーザー一覧</h2>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1">
            <ul className="space-y-3 w-2/3 mx-auto">
              {users.filter((user) => user !== currentUser).map((user) => (
                <li
                  key={user}
                  onClick={() => handleUserClick(user)}
                  className="relative bg-white text-[#2e8b57] rounded px-3 py-2 text-m text-center"
                >
                  {user}
                  {userToRoomIdMap[user] !== undefined && unreadCounts[userToRoomIdMap[user]] > 0 && (
                    <span className="absolute top-1 right-1 bg-red-500 text-white text-[11px] font-bold px-2 h-[20px] leading-[20px] rounded-[10px] shadow-sm min-w-[24px] text-center">
                      {unreadCounts[userToRoomIdMap[user]] > 99 ? "99+" : unreadCounts[userToRoomIdMap[user]]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* チャット画面 */}
        <div className="w-3/4 flex flex-col min-h-0">
          <div className="bg-white p-4 border-b">
            <h2 className="text-lg font-semibold text-[#2e8b57]">{decodeURIComponent(userId as string)}</h2>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-gray-50 scrollbar-hide">
            {messages.map((msg) => {
              const readers = messageReads[msg.id] || [];
              const isSender = msg.sender === currentUser;
              const root = messages.find(m => m.id === msg.thread_root_id);

              return (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  isSender={isSender}
                  readers={readers}
                  reactions={messageReactions[msg.id] || []}
                  actionBoxVisible={actionBoxVisible}
                  currentUser={currentUser!}
                  actionBoxRefs={actionBoxRefs}
                  setActionBoxVisible={setActionBoxVisible}
                  setReplyTo={setReplyTo}
                  handleHide={handleHide}
                  handleRevoke={handleRevoke}
                  handleReaction={handleReaction}
                  quotedMessage={
                    root ? { sender: root.sender, content: root.content,attachment: root.attachment,} : undefined
                  }
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t bg-white px-4 py-3">
            {previewImage && (
              <div className="mb-2 relative w-fit">
                <img src={previewImage} className="max-h-48 rounded shadow" alt="preview" />
                <button
                  onClick={() => setPreviewImage(null)}
                  className="absolute -top-2 -right-2 bg-black text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex items-end">
              {/* 左下、画像など */}
              <div className="flex flex-col justify-end mr-2">
                <input type="file" id="file-upload" style={{ display: "none" }} onChange={handleFileUpload} />
                <input type="file" accept="image/*" id="image-upload" style={{ display: "none" }} onChange={handleImageUpload} />
                <div className="relative flex space-x-2 text-xl text-gray-600">
                  <button onClick={() => document.getElementById("file-upload")?.click()} title="ファイル">📎</button>
                  <button onClick={() => document.getElementById("image-upload")?.click()} title="画像">🖼️</button>
                  <button onClick={() => setShowEmojiPicker(prev => !prev)} title="絵文字">😊</button>
                  {showEmojiPicker && (
                    <div
                      className="absolute z-50 bg-white rounded shadow-lg origin-bottom-left"
                      style={{
                        bottom: '100%',
                        left: 0,
                        transform: 'translateY(-10px) scale(0.75)',
                        transformOrigin: 'bottom left',
                      }}
                    >
                      <EmojiPicker
                        onEmojiClick={(emojiData) => {
                          setMessage((prev) => prev + emojiData.emoji); 
                          setShowEmojiPicker(false);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 入力 */}
              <div className="flex-1 flex flex-col relative">
                {replyTo && (
                  <div className="mb-2 px-3 py-1 bg-gray-100 border-l-4 border-[#2e8b57] text-sm text-gray-700 rounded">
                    <div className="flex justify-between items-center">
                      <span>
                        ↩ {replyTo.sender}：
                        {replyTo.attachment ? (
                          replyTo.attachment.match(/\.(jpg|jpeg|png|gif)$/i)
                            ? "｜画像"
                            : "｜ファイル"
                        ) : replyTo.content}
                      </span>
                      <button
                        className="text-xs text-gray-500 hover:text-red-500 ml-2"
                        onClick={() => setReplyTo(null)}
                      >
                        × キャンセル
                      </button>
                    </div>
                  </div>
                )}
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm resize-none max-h-36 overflow-y-auto"
                  rows={1}
                  placeholder="メッセージを入力...（Enterで送信 / Shift+Enterで改行）"
                  value={message}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMessage(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
              </div>

              {/* 送信ボタン */}
              <div className="ml-3">
                <button
                  onClick={handleSend}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  送信
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}