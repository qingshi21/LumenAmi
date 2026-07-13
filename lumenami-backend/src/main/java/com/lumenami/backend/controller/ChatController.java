package com.lumenami.backend.controller;

import com.lumenami.backend.dto.ChatRequest;
import com.lumenami.backend.dto.ChatResponse;
import com.lumenami.backend.dto.Result;
import com.lumenami.backend.model.ChatMessage;
import com.lumenami.backend.service.ChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private final ChatService chatService;

    @PostMapping
    public Result<ChatResponse> chat(
            @RequestAttribute("userId") Integer userId,
            @RequestBody ChatRequest request) {
        // 参数校验
        if (userId == null) {
            return Result.error(400, "用户ID不能为空");
        }
        if (request.getPetId() == null) {
            return Result.error(400, "宠物ID不能为空");
        }
        if (request.getMessage() == null || request.getMessage().trim().isEmpty()) {
            return Result.error(400, "消息内容不能为空");
        }
        ChatResponse response = chatService.chat(userId, request);
        return Result.success(response);
    }

    @GetMapping("/history/{petId}")
    public Result<List<ChatMessage>> getHistory(
            @RequestAttribute("userId") Integer userId,
            @PathVariable Integer petId) {
        if (userId == null || petId == null) {
            return Result.error(400, "参数不完整");
        }
        List<ChatMessage> history = chatService.getHistory(userId, petId);
        return Result.success(history);
    }
}
