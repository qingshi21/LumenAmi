package com.lumenami.backend.service.impl;

import com.lumenami.backend.dto.CreatePetRequest;
import com.lumenami.backend.dto.PetResponse;
import com.lumenami.backend.exception.BusinessException;
import com.lumenami.backend.mapper.PetMapper;
import com.lumenami.backend.model.Pet;
import com.lumenami.backend.service.PetService;
import com.lumenami.backend.service.QwenService;
import com.lumenami.backend.service.WebSearchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 宠物服务实现类
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PetServiceImpl implements PetService {

    private final PetMapper petMapper;
    private final QwenService qwenService;
    private final WebSearchService webSearchService;

    @Override
    @Transactional
    public PetResponse createPet(Integer userId, CreatePetRequest request) {
        log.info("创建宠物请求: userId={}, name={}", userId, request.getName());
        
        if (request.getName() == null || request.getName().trim().isEmpty()) {
            throw new BusinessException(400, "宠物名称不能为空");
        }
        if (request.getSystemPrompt() == null || request.getSystemPrompt().trim().isEmpty()) {
            throw new BusinessException(400, "System Prompt 不能为空");
        }

        int count = petMapper.countByNameAndUserId(userId, request.getName());
        if (count > 0) {
            log.warn("创建宠物失败，名称已存在: userId={}, name={}", userId, request.getName());
            throw new BusinessException(400, "已存在同名宠物");
        }

        Pet pet = new Pet();
        pet.setUserId(userId);
        pet.setName(request.getName());
        pet.setRoleName(request.getRoleName());
        pet.setSystemPrompt(request.getSystemPrompt());
        pet.setIsActive(0);
        petMapper.insert(pet);

        log.info("创建宠物成功: petId={}, name={}, userId={}", pet.getId(), pet.getName(), userId);
        return toResponse(pet);
    }

    @Override
    public List<PetResponse> getPetsByUserId(Integer userId) {
        log.debug("查询用户宠物列表: userId={}", userId);
        List<PetResponse> pets = petMapper.findByUserId(userId)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
        log.debug("查询用户宠物列表完成: userId={}, count={}", userId, pets.size());
        return pets;
    }

    @Override
    @Transactional
    public PetResponse switchPet(Integer userId, Integer petId) {
        log.info("切换宠物请求: userId={}, petId={}", userId, petId);
        
        Pet pet = petMapper.findById(petId);
        if (pet == null || !pet.getUserId().equals(userId)) {
            log.warn("切换宠物失败，宠物不存在: userId={}, petId={}", userId, petId);
            throw new BusinessException(404, "宠物不存在");
        }

        petMapper.deactivateAllByUserId(userId);
        petMapper.activate(petId);

        Pet updated = petMapper.findById(petId);
        log.info("切换宠物成功: userId={}, petId={}, petName={}", userId, petId, updated.getName());
        return toResponse(updated);
    }

    @Override
    @Transactional
    public void deletePet(Integer userId, Integer petId) {
        log.info("删除宠物请求: userId={}, petId={}", userId, petId);
        
        Pet pet = petMapper.findById(petId);
        if (pet == null || !pet.getUserId().equals(userId)) {
            log.warn("删除宠物失败，宠物不存在: userId={}, petId={}", userId, petId);
            throw new BusinessException(404, "宠物不存在");
        }
        petMapper.deleteById(petId);
        
        log.info("删除宠物成功: userId={}, petId={}", userId, petId);
    }

    private PetResponse toResponse(Pet pet) {
        PetResponse resp = new PetResponse();
        resp.setPetId(pet.getId());
        resp.setName(pet.getName());
        resp.setRoleName(pet.getRoleName());
        resp.setIsActive(pet.getIsActive() == 1);
        return resp;
    }

    @Override
    public String generateRoleUnderstanding(String name, String roleName, String description) {
        log.info("生成角色理解请求: name={}, roleName={}", name, roleName);

        // 1. 判断用户提供的信息是否充足（角色名 + 超过20字的描述视为充足）
        boolean hasSufficientInfo = (roleName != null && !roleName.trim().isEmpty())
                && (description != null && !description.trim().isEmpty() && description.length() > 20);

        String webSearchResult = null;
        boolean searchFailed = false;

        // 2. 如果信息不足，尝试联网搜索
        if (!hasSufficientInfo && roleName != null && !roleName.trim().isEmpty()) {
            log.info("用户信息不足，尝试联网搜索角色: {}", roleName);
            try {
                webSearchResult = webSearchService.searchCharacterInfo(roleName);
            } catch (Exception e) {
                log.error("联网搜索异常: {}", roleName, e);
            }

            if (webSearchResult == null || webSearchResult.trim().isEmpty()) {
                log.warn("联网搜索未找到角色信息: {}", roleName);
                searchFailed = true;
            } else {
                log.info("联网搜索成功，获取到角色信息长度: {}", webSearchResult.length());
            }
        }

        // 3. 构建角色理解的 system prompt（强调基于公开信息，不瞎编）
        String understandingPrompt = buildRoleUnderstandingPrompt(name, roleName, description, webSearchResult);

        // 4. 调用 Qwen 生成角色理解
        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> userMsg = new HashMap<>();
        userMsg.put("role", "user");
        userMsg.put("content", "请帮我理解并描述这个角色。");
        messages.add(userMsg);

        String result = qwenService.chat(understandingPrompt, messages);

        // 5. 如果搜索失败，在结果前添加警告提示
        if (searchFailed) {
            result = "[WARNING]联网搜索信息有限，AI理解可能会有偏差，请谨慎使用。\n\n" + result;
        }

        log.info("角色理解生成完成: name={}, resultLength={}, searchFailed={}", name, result.length(), searchFailed);
        return result;
    }

    /**
     * 构建角色理解的 prompt
     * 核心原则：优先使用用户信息 + 公开资料，禁止瞎编
     */
    private String buildRoleUnderstandingPrompt(String name, String roleName, String description, String webSearchResult) {
        StringBuilder sb = new StringBuilder();

        // 【最高优先级规则】
        sb.append("【最高规则 - 必须严格遵守】\n");
        sb.append("1. ❌ 绝对禁止凭空捏造角色的性格、背景、能力、经历等信息\n");
        sb.append("2. ❌ 绝对禁止捏造角色出自某部作品（如'出自《xxx》'），除非你100%确定\n");
        sb.append("3. ❌ 禁止使用小说式、文学化的描写（如'霜会融化但水记得形状'）\n");
        sb.append("4. ❌ 禁止描述语调、呼吸、声音频率、重音位置等表演细节\n");
        sb.append("5. ❌ 禁止描述动作、表情、场景（如'指尖凝霜花''眼尾弯成月牙'）\n");
        sb.append("6. ✅ 优先基于【用户提供的描述】来理解角色，用户说的算\n");
        sb.append("7. ✅ 如果你对这个角色不确定，只描述你确定的部分，其余不写\n");
        sb.append("8. ✅ 用自然客观的口语描述，像介绍朋友一样\n");
        sb.append("9. ✅ 长度控制在 300-500 字，宁短勿长\n");
        sb.append("\n");

        sb.append("你是一个AI伙伴设定助手。你的任务是根据提供的信息，生成一段准确、自然的角色设定。\n");
        sb.append("核心原则：用户提供的信息 > 你的已有知识 > 联网搜索结果。用户说的永远优先。\n");
        sb.append("不要编造角色出自哪部作品，不要编造你没有把握的信息。\n\n");

        // 角色名称
        if (roleName != null && !roleName.trim().isEmpty()) {
            sb.append("【角色名称】").append(roleName).append("\n");
            sb.append("请根据这个角色名称，结合你的知识和下方提供的可选理解方向（不一定要回答下方问题，仅供参考）以及公开资料，描述角色：\n");
            sb.append("- 他/她大概是什么性格？（用'很温柔''有点傲娇'这种口语）\n");
            sb.append("- 平时怎么说话？（简洁还是话多？喜欢开玩笑吗？）\n");
            sb.append("- 对朋友怎么样？（关心但不肉麻，有边界感）\n");
            sb.append("- 有什么显著的特征或习惯吗？\n");
            sb.append("- 有什么爱好吗？\n");
            sb.append("\n");
        } else {
            sb.append("【注意】没有指定角色名称，请根据昵称和描述来推断角色特征。\n\n");
        }

        // 用户给的角色昵称
        sb.append("【用户给角色的昵称】").append(name != null ? name : "未设置").append("\n");

        // 用户提供的描述
        if (description != null && !description.trim().isEmpty()) {
            sb.append("【用户提供的描述（最高优先级，必须优先参考）】\n").append(description).append("\n\n");
        }

        // 联网搜索到的公开资料
        if (webSearchResult != null && !webSearchResult.trim().isEmpty()) {
            sb.append("【联网搜索到的参考资料（可能不准确，仅供参考，请结合自己的知识判断）】\n");
            sb.append(webSearchResult).append("\n\n");
            sb.append("↑ 以上是网络搜索的结果，可能包含错误信息。请自行判断是否合理，不要盲目采信。\n\n");
        } else if (roleName != null && !roleName.trim().isEmpty()) {
            sb.append("【关于角色知识】\n");
            sb.append("请根据你对「").append(roleName).append("」这个角色的已有知识来描述。\n");
            sb.append("如果你对这个角色了解有限，请只描述你确定的部分，不要编造不确定的内容。\n\n");
        }

        // 输出示例
        sb.append("\n【输出示例对比】\n");
        sb.append("❌ 错误示范（编造作品来源、太文艺）：\n");
        sb.append("'艾莎是迪士尼《冰雪奇缘》中的公主，外冷内热、自尊自持，语调偏中低频，平稳如雪落湖面...'\n");
        sb.append("✅ 正确示范（自然、口语化、不编造来源）：\n");
        sb.append("'你是艾莎，一个温柔知性的大姐姐型角色。有时候外冷内热自尊自持，平时说话比较简洁，不太爱啰嗦，但对朋友很上心。不会说太多甜言蜜语，但会用实际行动照顾人。有点小傲娇，不喜欢被同情，更喜欢平等交流。'");

        return sb.toString();
    }
}
