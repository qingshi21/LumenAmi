package com.lumenami.backend.config;

import com.lumenami.backend.dto.Result;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * JWT 认证拦截器
 * 从 Authorization 头提取并验证 token，将 userId 注入到 request attribute
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;
    private final ObjectMapper objectMapper;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 放行 OPTIONS 预检请求
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            log.warn("缺少或无效的 Authorization 头: uri={}", request.getRequestURI());
            writeError(response, 401, "未登录或 token 已过期");
            return false;
        }

        String token = authHeader.substring(7);
        Claims claims = jwtUtil.validateToken(token);
        if (claims == null) {
            log.warn("token 验证失败: uri={}", request.getRequestURI());
            writeError(response, 401, "token 无效或已过期");
            return false;
        }

        Integer userId = jwtUtil.getUserIdFromToken(claims);
        request.setAttribute("userId", userId);
        log.debug("JWT 认证通过: userId={}, uri={}", userId, request.getRequestURI());
        return true;
    }

    private void writeError(HttpServletResponse response, int code, String message) throws Exception {
        response.setContentType("application/json;charset=UTF-8");
        response.setStatus(code == 401 ? 401 : 200);
        response.getWriter().write(objectMapper.writeValueAsString(Result.error(code, message)));
    }
}
