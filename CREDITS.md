# Credits / 致谢

## Original game — Saltline

**First and foremost, thank you to [Felix Rieseberg](https://github.com/felixrieseberg) and [Saltline](https://saltline.games/play/index.html).** Saltline's harbor environment, renderer and core game technology form the foundation of Last Harbor: Departure.

Saltline originated as a Claude Fable 5.2 experiment initiated by Felix Rieseberg. LastHarbor expands that foundation with a five-chapter survival horror story, new encounters and port infrastructure systems.

**首先感谢 [Felix Rieseberg](https://github.com/felixrieseberg) 的 [Saltline](https://saltline.games/play/index.html)。** 原作的港口环境、渲染与核心游戏技术构成了《末港：今夜离港》的基础。Saltline 源于 Felix Rieseberg 发起的 Claude Fable 5.2 实验，本作在此基础上加入五章生存恐怖剧情、战斗遭遇与港务设施系统。

[Play Saltline](https://saltline.games/play/index.html) · [Original Claude artifact](https://claude.ai/artifact/BGY1SztrAYcJQHSsnHHGmp) · [Reference mirror](https://github.com/realcodebear/saltline-fable-5.2)

## Chinese localization — 几猫汉化版

Thanks to **几猫汉化版** for the Chinese localization used in this project.

感谢**几猫汉化版**提供的中文本地化版本。

## 3D assets — Tripo AI

Selected character, equipment and environment assets were created or processed with the assistance of **[Tripo AI](https://www.tripo3d.ai/)**, including infected, personnel models, weapons and harbor industrial props.

部分感染者、人物、装备与港口工业道具借助 **Tripo AI** 生成或处理。Saltline 的程序化港口与机械模型，以及本项目新增的程序化几何和贴图，共同构成游戏场景。

**Knife model — Sergio.** The supplied `Punhal.STEP` model was converted and adapted for use in LastHarbor.

**匕首模型 — Sergio。** 本项目将提供的 `Punhal.STEP` 模型转换为游戏网格并完成使用适配。

## Audio — ElevenLabs & procedural sound

**[ElevenLabs](https://elevenlabs.io/)** was used to create the infected vocalizations: 16 clips covering idle, alert, attack and chase states.

| Audio | Source |
| --- | --- |
| Infected vocalizations | ElevenLabs-generated sound effects |
| Harbor, original weapons and machinery | Saltline's procedural audio and mixer |
| Added knife effects and ending audio | LastHarbor's synthesized effects and mixer extensions |

感染者的待机、警觉、攻击与追逐声音使用 **ElevenLabs** 生成。港口环境、原武器和机械设备沿用 Saltline 的程序化音频；新增匕首音效与结局声音呈现结合了本项目编写的合成逻辑和既有混音器。

## Technology

<p><a href="https://threejs.org/"><img src="docs/media/tech-threejs.svg" width="28" height="28" alt="Three.js"></a> Three.js &nbsp; <a href="https://www.khronos.org/webgl/"><img src="docs/media/tech-webgl.svg" width="28" height="28" alt="WebGL"></a> WebGL &nbsp; <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"><img src="docs/media/tech-javascript.svg" width="28" height="28" alt="JavaScript"></a> JavaScript</p>

| Technology | Use |
| --- | --- |
| Three.js r180 / WebGL 2 | Rendering and scene management |
| JavaScript ES modules / Web Audio API | Campaign systems, resource loading and audio |
| Node.js / npm | Build tools and local preview |
| `@babel/parser` | Build-time source parsing |
| `@playwright/test` | Browser testing |

Technology icons: [Simple Icons](https://simpleicons.org/), CC0.

## Development

LastHarbor combines story adaptation, five-chapter campaign integration, gameplay extensions, asset integration and presentation. Its workflow brings together AI-assisted programming, generative 3D asset tools and AI-generated audio.

本项目的制作包括剧情改编、五章战役整合、玩法扩展、资源接入与表现设计，结合了 AI 辅助编程、生成式 3D 工具与 AI 音效制作。

## License & notices / 许可说明

Original LastHarbor contributions: [PolyForm Noncommercial 1.0.0](LICENSE). Full terms and attribution: [NOTICE](NOTICE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

本项目原创新增内容的许可、署名要求与第三方声明详见以上文件。
