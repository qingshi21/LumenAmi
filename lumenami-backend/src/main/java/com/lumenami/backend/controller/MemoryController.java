package com.lumenami.backend.controller;

import com.lumenami.backend.dto.Result;
import com.lumenami.backend.model.PetMemory;
import com.lumenami.backend.service.MemoryService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/memories")
@RequiredArgsConstructor
@Slf4j
public class MemoryController {

    private final MemoryService memoryService;

    /**
     * 获取宠物的所有记忆（用于前端展示）
     */
    @GetMapping("/pet/{petId}")
    public Result<List<PetMemory>> getMemories(
            @RequestAttribute("userId") Integer userId,
            @PathVariable Integer petId) {
        // 校验用户是否拥有该宠物
        memoryService.verifyPetOwnership(userId, petId);
        List<PetMemory> memories = memoryService.getMemories(petId);
        return Result.success(memories);
    }

    /**
     * 获取某个key的记忆历史（所有版本）
     */
    @GetMapping("/pet/{petId}/history/{key}")
    public Result<List<PetMemory>> getMemoryHistory(
            @RequestAttribute("userId") Integer userId,
            @PathVariable Integer petId,
            @PathVariable String key) {
        // 校验用户是否拥有该宠物
        memoryService.verifyPetOwnership(userId, petId);
        List<PetMemory> history = memoryService.getMemoryHistory(petId, key);
        return Result.success(history);
    }

    /**
     * 删除记忆（手动修正）
     */
    @DeleteMapping("/{id}")
    public Result<Void> deleteMemory(
            @RequestAttribute("userId") Integer userId,
            @PathVariable Integer id) {
        memoryService.deleteMemory(userId, id);
        return Result.success(null);
    }

    /**
     * 更新记忆（手动修正）
     */
    @PutMapping("/{id}")
    public Result<Void> updateMemory(
            @RequestAttribute("userId") Integer userId,
            @PathVariable Integer id,
            @RequestBody UpdateMemoryRequest request) {
        memoryService.updateMemory(userId, id, request.getValue(), request.getImportance());
        return Result.success(null);
    }

    /**
     * 手动添加记忆
     */
    @PostMapping
    public Result<Void> addMemory(
            @RequestAttribute("userId") Integer userId,
            @RequestBody AddMemoryRequest request) {
        // 参数校验
        if (request.getPetId() == null) {
            return Result.error(400, "宠物ID不能为空");
        }
        if (request.getKey() == null || request.getKey().trim().isEmpty()) {
            return Result.error(400, "记忆键名不能为空");
        }
        if (request.getValue() == null || request.getValue().trim().isEmpty()) {
            return Result.error(400, "记忆值不能为空");
        }
        // 校验用户是否拥有该宠物
        memoryService.verifyPetOwnership(userId, request.getPetId());
        
        memoryService.saveMemory(
            request.getPetId(), 
            request.getKey(), 
            request.getValue(), 
            request.getType(), 
            request.getImportance()
        );
        return Result.success(null);
    }

    @Data
    public static class UpdateMemoryRequest {
        private String value;
        private Integer importance;
    }

    @Data
    public static class AddMemoryRequest {
        private Integer petId;
        private String key;
        private String value;
        private String type;
        private Integer importance;
    }
}
