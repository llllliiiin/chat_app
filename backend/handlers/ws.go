package handlers

import (
	"log"
	"net/http"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
)

type WebSocketHub struct {
	Clients    map[int]map[*websocket.Conn]bool // roomID -> set of conns
	Register   chan ClientConn
	Unregister chan ClientConn
	Broadcast  chan WSMessage
	Mutex      sync.Mutex
}

type ClientConn struct {
	RoomID int
	Conn   *websocket.Conn
}

type WSMessage struct {
	RoomID int            `json:"room_id"`
	Data   map[string]any `json:"data"`
}

var Upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewHub() *WebSocketHub {
	return &WebSocketHub{
		Clients:    make(map[int]map[*websocket.Conn]bool),
		Register:   make(chan ClientConn),
		Unregister: make(chan ClientConn),
		Broadcast:  make(chan WSMessage),
	}
}

func (hub *WebSocketHub) Run() {
	for {
		select {
		case client := <-hub.Register:
			hub.Mutex.Lock()
			if hub.Clients[client.RoomID] == nil {
				hub.Clients[client.RoomID] = make(map[*websocket.Conn]bool)
			}
			hub.Clients[client.RoomID][client.Conn] = true
			hub.Mutex.Unlock()

		case client := <-hub.Unregister:
			hub.Mutex.Lock()
			if conns, ok := hub.Clients[client.RoomID]; ok {
				delete(conns, client.Conn)
				client.Conn.Close()
			}
			hub.Mutex.Unlock()

		case msg := <-hub.Broadcast:
			hub.Mutex.Lock()
			for conn := range hub.Clients[msg.RoomID] {
				if err := conn.WriteJSON(msg.Data); err != nil {
					log.Println("🔴 寫入 WebSocket 失敗:", err)
					conn.Close()
					delete(hub.Clients[msg.RoomID], conn)
				}
			}
			hub.Mutex.Unlock()
		}
	}
}

func (s *Server) WebSocketHandler(hub *WebSocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID, _ := strconv.Atoi(r.URL.Query().Get("room_id"))
		conn, err := Upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("❌ WebSocket 升級失敗:", err)
			return
		}

		client := ClientConn{RoomID: roomID, Conn: conn}
		hub.Register <- client

		for {
			var dummy map[string]any
			if err := conn.ReadJSON(&dummy); err != nil {
				hub.Unregister <- client
				break
			}
		}
	}
}
