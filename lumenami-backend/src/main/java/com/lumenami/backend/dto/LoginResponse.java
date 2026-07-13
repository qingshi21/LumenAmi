package com.lumenami.backend.dto;

import lombok.Data;

@Data
public class LoginResponse {
    private Integer userId;
    private String username;
    private String token;  // JWT token
}