package handlers

import (
	gen "backend/api/gen" // 保持不变
	"backend/utils"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"

	"golang.org/x/crypto/bcrypt"
	//JWT的核心代码
)

type Server struct {
	DB *sql.DB
}

func (s *Server) SignupPost(ctx context.Context, req *gen.SignupRequest) (gen.SignupPostRes, error) {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	_, err = s.DB.ExecContext(ctx,
		"INSERT INTO users (username, password_hash) VALUES ($1, $2)",
		req.Username, string(hashedPassword))
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

func (s *Server) LoginPost(ctx context.Context, req *gen.LoginRequest) (gen.LoginPostRes, error) {
	log.Println("LoginPost called!")

	var storedHash string
	err := s.DB.QueryRowContext(ctx,
		"SELECT password_hash FROM users WHERE username = $1",
		req.Username).Scan(&storedHash)

	if err == sql.ErrNoRows {
		return nil, errors.New("用户不存在")
	} else if err != nil {
		return nil, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password))
	if err != nil {
		return nil, errors.New("密码错误")
	}

	// ⬇️ 生成 JWT
	token, err := utils.GenerateJWT(req.Username)
	if err != nil {
		return nil, errors.New("生成 token 失败")
	}

	fmt.Println("✅ 生成的 JWT token:", token)

	// ⬇️ 返回 token 给前端
	return &gen.LoginResponse{
		Message: "登录成功",
		Token:   token, // 你需要在 OpenAPI 中定义 token 字段（或在前端手动处理）
	}, nil
	// return &gen.LoginResponse{
	// 	Message: "登录成功",
	// }, nil
}

func (s *Server) NewError(ctx context.Context, err error) *gen.ErrorResponseStatusCode {
	return &gen.ErrorResponseStatusCode{
		StatusCode: 500,
		Response: gen.ErrorResponse{
			Message: err.Error(),
		},
	}
}

// // // 定义一个空 struct，专门用来实现接口方法
// // type signupPostMarker struct{}

// // func (signupPostMarker) loginPostRes() {}

// // type loginPostMarker struct{}

// // func (loginPostMarker) loginPostRes() {}

// // // type signupPostOK struct {
// // // 	gen.SignupResponse
// // // }

// // // func (r *signupPostOK) signupPostRes() {}

// // // func NewSignupPostOK(v gen.SignupResponse) gen.SignupPostRes {
// // // 	return &signupPostOK{SignupResponse: v}
// // // }

// // // type loginPostOK struct {
// // // 	gen.LoginResponse
// // // }

// // // func (r *loginPostOK) loginPostRes() {}

// // // func NewLoginPostOK(v gen.LoginResponse) gen.LoginPostRes {
// // // 	return &loginPostOK{LoginResponse: v}
// // // }

// // // func (s *Server) SignupPost(ctx context.Context, req *gen.SignupRequest) (*gen.SignupResponse, error) {
// // // 	_, err := s.DB.ExecContext(ctx,
// // // 		"INSERT INTO users (username, password_hash) VALUES ($1, $2)",
// // // 		req.Username, req.Password)
// // // 	if err != nil {
// // // 		return nil, err
// // // 	}
// // // 	return &gen.SignupResponse{
// // // 		Message: gen.OptString{
// // // 			Set:   true,
// // // 			Value: "注册成功",
// // // 		},
// // // 	}, nil
// // // }

// func (s *Server) SignupPost(ctx context.Context, req *gen.SignupRequest) (*gen.SignupResponse, error) {
// 	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
// 	// 1. 对密码进行哈希加密
// 	if err != nil {
// 		return nil, err
// 	}
// 	// 2. 插入加密后的密码
// 	_, err = s.DB.ExecContext(ctx,
// 		"INSERT INTO users (username, password_hash) VALUES ($1, $2)",
// 		req.Username, string(hashedPassword))
// 	if err != nil {
// 		return nil, err
// 	}

// 	// return &gen.SignupResponse{
// 	// 	Message: "注册成功",
// 	// },nil

// 	return &gen.SignupResponse{
// 		Message: gen.OptString{
// 			Set:   true,
// 			Value: "注册成功",
// 		},
// 	}, nil
// }

// func (s *Server) LoginPost(ctx context.Context, req *gen.LoginRequest) (*gen.LoginResponse, error) {
// 	// 查询用户的密码哈希
// 	log.Println("LoginPost called!")
// 	var storedHash string
// 	err := s.DB.QueryRowContext(ctx,
// 		"SELECT password_hash FROM users WHERE username = $1",
// 		req.Username).Scan(&storedHash)

// 	// 用户不存在
// 	if err == sql.ErrNoRows {
// 		return nil, errors.New("用户不存在")
// 	} else if err != nil {
// 		return nil, err
// 	}

// 	// 对比密码
// 	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password))
// 	if err != nil {
// 		return nil, errors.New("密码错误")
// 	}

// 	// // 返回登录成功响应
// 	// return &gen.SignupResponse{
// 	// 	Message: "登录成功",
// 	// }

// 	return &gen.LoginResponse{
// 		Message: gen.OptString{
// 			Set:   true,
// 			Value: "登录成功",
// 		},
// 	}, nil
// }

// func (s *Server) SignupPost(ctx context.Context, req *gen.SignupRequest) (gen.SignupPostRes, error) {
// 	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
// 	if err != nil {
// 		return nil, err
// 	}

// 	_, err = s.DB.ExecContext(ctx,
// 		"INSERT INTO users (username, password_hash) VALUES ($1, $2)",
// 		req.Username, string(hashedPassword))
// 	if err != nil {
// 		return nil, err
// 	}

// 	return &struct {
// 		gen.SignupResponse
// 		signupPostMarker
// 	}{SignupResponse: gen.SignupResponse{
// 		Message: gen.OptString{
// 			Set:   true,
// 			Value: "注册成功",
// 		},
// 	}}, nil

// 	// return NewSignupPostOK(gen.SignupResponse{
// 	// 	Message: gen.OptString{
// 	// 		Set:   true,
// 	// 		Value: "注册成功",
// 	// 	},
// 	// }), nil
// }

// func (s *Server) NewError(ctx context.Context, err error) *gen.ErrorResponseStatusCode {
// 	return &gen.ErrorResponseStatusCode{
// 		StatusCode: 500, // 或根据错误类型自定义，比如 400、404
// 		Response: gen.ErrorResponse{
// 			Message: err.Error(),
// 		},
// 	}
// }

// func (s *Server) LoginPost(ctx context.Context, req *gen.LoginRequest) (gen.LoginPostRes, error) {
// 	log.Println("LoginPost called!")

// 	var storedHash string
// 	err := s.DB.QueryRowContext(ctx,
// 		"SELECT password_hash FROM users WHERE username = $1",
// 		req.Username).Scan(&storedHash)

// 	if err == sql.ErrNoRows {
// 		return nil, errors.New("用户不存在")
// 	} else if err != nil {
// 		return nil, err
// 	}

// 	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password))
// 	if err != nil {
// 		return nil, errors.New("密码错误")
// 	}

//		// return NewLoginPostOK(gen.LoginResponse{
//		// 	Message: "登录成功",
//		// }), nil
//		return &struct {
//			gen.LoginResponse
//			loginPostMarker
//		}{LoginResponse: gen.LoginResponse{
//			Message: "登录成功",
//		}}, nil
//		// return &gen.LoginResponse{
//		// 	Message: gen.OptString{
//		// 		Set:   true,
//		// 		Value: "登录成功",
//		// 	},
//		// }, nil
//	}

// package handlers

// import (
// 	"context"
// 	"database/sql"
// 	"errors"
// 	"log"

// 	gen "backend/api/gen"

// 	"golang.org/x/crypto/bcrypt"
// )

// type Server struct {
// 	DB *sql.DB
// }

// // --- 注册响应包装类型 ---
// type signupPostOK struct {
// 	gen.SignupResponse
// }

// func (signupPostOK) signupPostRes() {}

// func NewSignupPostOK(resp gen.SignupResponse) gen.SignupPostRes {
// 	return &signupPostOK{SignupResponse: resp}
// }

// // --- 登录响应包装类型 ---
// type loginPostOK struct {
// 	gen.LoginResponse
// }

// func (loginPostOK) loginPostRes() {}

// func NewLoginPostOK(resp gen.LoginResponse) gen.LoginPostRes {
// 	return &loginPostOK{LoginResponse: resp}
// }

// // --- 注册接口实现 ---
// func (s *Server) SignupPost(ctx context.Context, req *gen.SignupRequest) (gen.SignupPostRes, error) {
// 	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
// 	if err != nil {
// 		return nil, err
// 	}

// 	_, err = s.DB.ExecContext(ctx,
// 		"INSERT INTO users (username, password_hash) VALUES ($1, $2)",
// 		req.Username, string(hashedPassword))
// 	if err != nil {
// 		return nil, err
// 	}

// 	return NewSignupPostOK(gen.SignupResponse{
// 		Message: gen.OptString{
// 			Set:   true,
// 			Value: "注册成功",
// 		},
// 	}), nil
// }

// // --- 登录接口实现 ---
// func (s *Server) LoginPost(ctx context.Context, req *gen.LoginRequest) (gen.LoginPostRes, error) {
// 	log.Println("LoginPost called!")

// 	var storedHash string
// 	err := s.DB.QueryRowContext(ctx,
// 		"SELECT password_hash FROM users WHERE username = $1",
// 		req.Username).Scan(&storedHash)

// 	if err == sql.ErrNoRows {
// 		return nil, errors.New("用户不存在")
// 	} else if err != nil {
// 		return nil, err
// 	}

// 	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password))
// 	if err != nil {
// 		return nil, errors.New("密码错误")
// 	}

// 	return NewLoginPostOK(gen.LoginResponse{
// 		Message: "登录成功",
// 	}), nil
// }

// // --- 错误响应生成 ---
// func (s *Server) NewError(ctx context.Context, err error) *gen.ErrorResponseStatusCode {
// 	return &gen.ErrorResponseStatusCode{
// 		StatusCode: 500,
// 		Response: gen.ErrorResponse{
// 			Message: err.Error(),
// 		},
// 	}
// }

// // --- 可选：接口实现校验（编译期安全检查） ---
// var (
// 	_ gen.SignupPostRes = (*signupPostOK)(nil)
// 	_ gen.LoginPostRes  = (*loginPostOK)(nil)
// 	_ gen.Handler       = (*Server)(nil)
// )

// package handlers

// import (
// 	"context"
// 	"database/sql"
// 	"errors"
// 	"log"

// 	gen "backend/api/gen"

// 	"golang.org/x/crypto/bcrypt"
// )

// type Server struct {
// 	DB *sql.DB
// }

// // --- 手动包装类型（v1.12.0 不自动生成） ---
// type signupPostOK struct {
// 	gen.SignupResponse
// }

// func (signupPostOK) signupPostRes() {}

// func NewSignupPostOK(resp gen.SignupResponse) gen.SignupPostRes {
// 	return &signupPostOK{SignupResponse: resp}
// }

// type loginPostOK struct {
// 	gen.LoginResponse
// }

// func (loginPostOK) loginPostRes() {}

// func NewLoginPostOK(resp gen.LoginResponse) gen.LoginPostRes {
// 	return &loginPostOK{LoginResponse: resp}
// }

// // --- 注册接口实现 ---
// func (s *Server) SignupPost(ctx context.Context, req *gen.SignupRequest) (gen.SignupPostRes, error) {
// 	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
// 	if err != nil {
// 		return nil, err
// 	}

// 	_, err = s.DB.ExecContext(ctx,
// 		"INSERT INTO users (username, password_hash) VALUES ($1, $2)",
// 		req.Username, string(hashedPassword))
// 	if err != nil {
// 		return nil, err
// 	}

// 	return NewSignupPostOK(gen.SignupResponse{
// 		Message: gen.OptString{
// 			Set:   true,
// 			Value: "注册成功",
// 		},
// 	}), nil
// }

// // --- 登录接口实现 ---
// func (s *Server) LoginPost(ctx context.Context, req *gen.LoginRequest) (gen.LoginPostRes, error) {
// 	log.Println("LoginPost called!")

// 	var storedHash string
// 	err := s.DB.QueryRowContext(ctx,
// 		"SELECT password_hash FROM users WHERE username = $1",
// 		req.Username).Scan(&storedHash)
// 	if err == sql.ErrNoRows {
// 		return nil, errors.New("用户不存在")
// 	} else if err != nil {
// 		return nil, err
// 	}

// 	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password))
// 	if err != nil {
// 		return nil, errors.New("密码错误")
// 	}

// 	return NewLoginPostOK(gen.LoginResponse{
// 		Message: "登录成功",
// 	}), nil
// }

// // --- ogen 要求实现的通用错误处理方法 ---
// func (s *Server) NewError(ctx context.Context, err error) *gen.ErrorResponseStatusCode {
// 	return &gen.ErrorResponseStatusCode{
// 		StatusCode: 500,
// 		Response: gen.ErrorResponse{
// 			Message: err.Error(),
// 		},
// 	}
// }

// // --- 编译期接口验证（可选） ---
// var (
// 	_ gen.SignupPostRes = (*signupPostOK)(nil)
// 	_ gen.LoginPostRes  = (*loginPostOK)(nil)
// 	_ gen.Handler       = (*Server)(nil)
// )
