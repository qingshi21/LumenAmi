package com.lumenami.backend.controller;

import com.lumenami.backend.dto.CreatePetRequest;
import com.lumenami.backend.dto.PetResponse;
import com.lumenami.backend.dto.Result;
import com.lumenami.backend.service.PetService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pets")
@RequiredArgsConstructor
@Slf4j
public class PetController {

    private final PetService petService;

    @PostMapping
    public Result<PetResponse> createPet(
            @RequestAttribute("userId") Integer userId,
            @RequestBody CreatePetRequest request) {
        PetResponse pet = petService.createPet(userId, request);
        return Result.success(pet);
    }

    @GetMapping
    public Result<List<PetResponse>> listPets(@RequestAttribute("userId") Integer userId) {
        List<PetResponse> pets = petService.getPetsByUserId(userId);
        return Result.success(pets);
    }

    @PatchMapping("/{petId}/activate")
    public Result<PetResponse> activatePet(
            @RequestAttribute("userId") Integer userId,
            @PathVariable Integer petId) {
        PetResponse pet = petService.switchPet(userId, petId);
        return Result.success(pet);
    }

    @DeleteMapping("/{petId}")
    public Result<String> deletePet(
            @RequestAttribute("userId") Integer userId,
            @PathVariable Integer petId) {
        petService.deletePet(userId, petId);
        return Result.success("删除成功");
    }

    /**
     * 生成角色理解文段（不依赖宠物ID，直接根据输入内容生成）
     */
    @PostMapping("/understand-role")
    public Result<String> understandRole(
            @RequestAttribute("userId") Integer userId,
            @RequestBody UnderstandRoleRequest request) {
        if (userId == null) {
            return Result.error(400, "未登录");
        }
        if (request.getName() == null || request.getName().trim().isEmpty()) {
            return Result.error(400, "请填写宠物名称");
        }
        String understanding = petService.generateRoleUnderstanding(
            request.getName(), request.getRoleName(), request.getDescription());
        return Result.success(understanding);
    }

    @Data
    public static class UnderstandRoleRequest {
        private String name;        // 宠物名称
        private String roleName;    // 角色名称
        private String description; // 用户描述
    }
}