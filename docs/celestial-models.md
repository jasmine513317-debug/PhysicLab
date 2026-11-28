# 三维天体实验的模型与数据

- 牛顿工作台使用 SI 单位、Plummer 软化和双向 N 体引力。Velocity Verlet 为默认积分器，可用 RK4 对照。球体接触在积分子步内做扫掠检测，按法向冲量、合并或简化破碎处理。破碎阈值由两体质量加权的材料强度与均匀球引力束缚能估算，结果采用三块等质量碎片，适用于课堂对照。
- J2000 太阳系使用 JPL 近似轨道要素。地球轨道用地月质心近似。独立的小天体参考预设保留各自来源的历元。假设行星是模型参数，显示大小可单独调整。
- 双黑洞的 1PN 圆轨道实验采用谐和坐标角频率和最低阶四极辐射收缩，在 20 GM/c² 停止。之后可以打开独立的数值合并回放和振铃实验。三个预设各自计时。
- 合并回放数据取自 Jonathan Blackman 与 SXS Collaboration 的 **SXS:BBH:0180，Lev4**。依据 CC BY 4.0，保留署名和来源。输入文件是 `Lev4:Horizons.h5`，MD5 为 `3f30cb8f563a7615901f9ee972b21882`。在 `AhA.dir`、`AhB.dir`、`AhC.dir` 中抽取 `CoordCenterInertial.dat` 和 `ArealMass.dat`，取最后约 220 M 的合并前轨迹和共同视界之后约 120 M 的数据。A/B 采用约 1 M 间隔，C 在形成初期保持较密采样。记录为 `[t/M,x/M,y/M,z/M,R_area/M]`，其中面积等效半径为面积质量的两倍，回放在采样点之间线性插值。
- 振铃预设使用等质量非自旋双黑洞的数值残骸参数与克尔基模拟合。单黑洞的自旋控制用于外视界和最内稳定圆轨道。弱场光线只保留质量的一阶偏折。无压球模型在强场之前截止。

[JPL 行星要素](https://ssd.jpl.nasa.gov/planets/approx_pos.html) · [JPL 小天体要素](https://ssd.jpl.nasa.gov/sb/elem_tables.html) · [SXS 数据记录](https://doi.org/10.5281/zenodo.13159590) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [振铃拟合](https://arxiv.org/abs/gr-qc/0512160)
