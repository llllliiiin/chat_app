package handlers

import (
	"context"
	"database/sql"

	"backend/gen" // 保持不变
)

type Server struct {
	DB *sql.DB
}

func (s *Server) SignupPost(ctx context.Context, req *gen.SignupRequest) (*gen.SignupResponse, error) {
	_, err := s.DB.ExecContext(ctx,
		"INSERT INTO users (username, password_hash) VALUES ($1, $2)",
		req.Username, req.Password)
	if err != nil {
		return nil, err
	}
	return &gen.SignupResponse{
		Message: gen.OptString{
			Set:   true,
			Value: "注册成功",
		},
	}, nil
}
