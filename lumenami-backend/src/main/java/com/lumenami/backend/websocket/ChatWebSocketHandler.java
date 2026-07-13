package com.lumenami.backend.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lumenami.backend.config.JwtUtil;
import com.lumenami.backend.dto.ChatRequest;
import com.lumenami.backend.dto.ChatResponse;
import com.lumenami.backend.service.ChatService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 聊天 WebSocket 处理器
 * 处理前端发来的 WebSocket 消息，支持聊天、心跳等功能
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private final WebSocketSessionManager sessionManager;
    private final ChatService chatService;
    private final JwtUtil jwtUtil;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 存储 sessionId -> userId 的映射，用于在收到消息时识别用户
     */
    private final Map<String, Integer> sessionUserMap = new ConcurrentHashMap<>();

    /**
     * 连接建立后处理
     * 从 URL 参数中提取 token 或 userId
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // 从 URI 查询参数中提取 token 和 userId
        String query = session.getUri().getQuery();
        String token = extractParamFromQuery(query, "token");
        Integer userId = null;

        // 优先使用 JWT token 验证（安全方式）
        if (token != null && !token.isEmpty()) {
            Claims claims = jwtUtil.validateToken(token);
            if (claims != null) {
                userId = jwtUtil.getUserIdFromToken(claims);
                log.info("WebSocket JWT 认证成功: userId={}", userId);
            } else {
                log.warn("WebSocket 连接 token 无效: sessionId={}", session.getId());
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(
                        WebSocketMessage.error("token 无效或已过期"))));
                session.close(CloseStatus.BAD_DATA);
                return;
            }
        }

        // 向后兼容：如果没有 token，尝试从 userId 参数获取（仅开发环境）
        if (userId == null) {
            Integer queryUserId = extractUserIdFromQuery(query);
            if (queryUserId != null) {
                log.warn("WebSocket 使用 userId 参数连接（无 token），仅建议开发环境使用: userId={}, sessionId={}", 
                        queryUserId, session.getId());
                userId = queryUserId;
            }
        }

        if (userId == null) {
            log.warn("WebSocket 连接缺少认证参数，关闭连接: sessionId={}", session.getId());
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(
                    WebSocketMessage.error("缺少认证参数"))));
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        // 保存 session 和 userId 映射
        sessionManager.addSession(session, userId);
        sessionUserMap.put(session.getId(), userId);

        // 发送连接成功确认消息
        WebSocketMessage connectedMsg = WebSocketMessage.connected("连接成功");
        connectedMsg.setUserId(userId);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(connectedMsg)));

        log.info("WebSocket 连接建立成功: userId={}, sessionId={}", userId, session.getId());
    }

    /**
     * 处理接收到的文本消息
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        log.debug("收到 WebSocket 消息: {}", payload);

        try {
            WebSocketMessage wsMessage = objectMapper.readValue(payload, WebSocketMessage.class);
            String type = wsMessage.getType();

            if (type == null) {
                sendError(session, "消息类型不能为空");
                return;
            }

            switch (type) {
                case "chat":
                    handleChatMessage(session, wsMessage);
                    break;
                case "ping":
                    handlePing(session);
                    break;
                default:
                    log.warn("未知的消息类型: {}", type);
                    sendError(session, "未知的消息类型: " + type);
            }
        } catch (Exception e) {
            log.error("处理 WebSocket 消息失败", e);
            sendError(session, "消息处理失败: " + e.getMessage());
        }
    }

    /**
     * 处理聊天消息
     */
    private void handleChatMessage(WebSocketSession session, WebSocketMessage wsMessage) throws Exception {
        Integer userId = sessionUserMap.get(session.getId());
        if (userId == null) {
            sendError(session, "用户未认证");
            return;
        }

        Integer petId = wsMessage.getPetId();
        String userMessage = wsMessage.getMessage();

        if (petId == null || userMessage == null || userMessage.trim().isEmpty()) {
            sendError(session, "宠物ID和消息内容不能为空");
            return;
        }

        // 先发送 typing 状态
        WebSocketMessage typingMsg = WebSocketMessage.typing(petId);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(typingMsg)));

        // 调用 ChatService 处理聊天
        ChatRequest chatRequest = new ChatRequest();
        chatRequest.setPetId(petId);
        chatRequest.setMessage(userMessage);

        try {
            ChatResponse chatResponse = chatService.chat(userId, chatRequest);

            // 发送 AI 回复
            WebSocketMessage replyMsg = WebSocketMessage.chatReply(petId, chatResponse.getReply());
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(replyMsg)));

            log.info("聊天回复已发送: userId={}, petId={}", userId, petId);
        } catch (Exception e) {
            log.error("聊天处理失败: userId={}, petId={}", userId, petId, e);
            sendError(session, "聊天处理失败: " + e.getMessage());
        }
    }

    /**
     * 处理心跳消息
     */
    private void handlePing(WebSocketSession session) throws Exception {
        WebSocketMessage pongMsg = WebSocketMessage.pong();
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(pongMsg)));
        log.debug("心跳响应已发送: sessionId={}", session.getId());
    }

    /**
     * 连接关闭后处理
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        Integer userId = sessionUserMap.remove(session.getId());
        sessionManager.removeSession(session);
        log.info("WebSocket 连接关闭: userId={}, sessionId={}, status={}", 
                userId, session.getId(), status);
    }

    /**
     * 处理传输错误
     */
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("WebSocket 传输错误: sessionId={}", session.getId(), exception);
        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    /**
     * 发送错误消息
     */
    private void sendError(WebSocketSession session, String errorMessage) throws Exception {
        WebSocketMessage errorMsg = WebSocketMessage.error(errorMessage);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(errorMsg)));
    }

    /**
     * 从 URL 查询参数中提取 userId（向后兼容）
     */
    private Integer extractUserIdFromQuery(String query) {
        String userIdStr = extractParamFromQuery(query, "userId");
        if (userIdStr != null) {
            try {
                return Integer.parseInt(userIdStr);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    /**
     * 从 URL 查询参数中提取指定参数
     */
    private String extractParamFromQuery(String query, String paramName) {
        if (query == null || query.isEmpty()) {
            return null;
        }
        for (String param : query.split("&")) {
            String[] pair = param.split("=");
            if (pair.length == 2 && paramName.equals(pair[0])) {
                return pair[1];
            }
        }
        return null;
    }
}
