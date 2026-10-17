/* ===========================================================
   皮影剧场 · 数据层
   =========================================================== */

export const ROLES = {
  '项羽': '净 · 霸王',
  '虞姬': '旦 · 虞美人',
  '孙悟空': '武生 · 齐天大圣',
  '白骨精': '妖 · 白骨夫人',
  '唐太宗': '生 · 大唐天子',
  '杨贵妃': '旦 · 贵妃',
  '梁山伯': '生 · 书生',
  '祝英台': '旦 · 才女',
  '牛郎': '生 · 耕者',
  '织女': '旦 · 天孙',
};

export const STORIES = [
  {
    id: '霸王别姬',
    title: '霸王别姬',
    subtitle: '垓下悲歌 · 末路情深',
    tone: ['净', '旦'],
    chars: ['项羽', '虞姬'],
    bg: 'assets/stories/霸王别姬.jpg',
    intro:
      '楚汉相争，垓下被围。四面楚歌之中，项王帐内悲歌「力拔山兮气盖世，时不利兮骓不逝」。虞姬和歌起舞，为断项王后顾之忧，横剑自刎于帐前。皮影以净角的雄浑与旦角的柔婉两相映照，借满台旌旗、篝火与城阙剪影，映出末路英雄的悲怆。',
    notes: ['满台旌旗 · 篝火灯影', '武打身段 · 剑舞程式'],
  },
  {
    id: '三打白骨精',
    title: '三打白骨精',
    subtitle: '火眼金睛 · 三番识妖',
    tone: ['武生', '妖'],
    chars: ['孙悟空', '白骨精'],
    bg: 'assets/stories/三打白骨精.jpg',
    intro:
      '白骨夫人三度幻化人形，欲取唐僧性命。悟空火眼金睛，三番识破、三番棒打，却为师父所误解，含冤被逐。皮影以猴王的灵动身段与妖气的诡谲剪影相搏，一棒一影，演出一场真假难辨的智斗。',
    notes: ['腾云筋斗 · 连续武打', '妖影虚实 · 一形三变'],
  },
  {
    id: '新贵妃醉酒',
    title: '新贵妃醉酒',
    subtitle: '百花亭畔 · 霓裳独酌',
    tone: ['旦', '生'],
    chars: ['杨贵妃', '唐太宗'],
    bg: 'assets/stories/新贵妃醉酒.jpg',
    intro:
      '百花亭前，杨玉环候驾不至，独饮至醉。霓裳轻旋，金樽倾覆，一颦一笑尽是盛唐的绮丽与落寞。皮影以水袖与翎子的翻飞，将醉态化为一缕流动的影，灯下摇漾，似真似幻。',
    notes: ['水袖翻飞 · 醉步流转', '翎子功 · 镂空灯影'],
  },
  {
    id: '梁祝',
    title: '梁祝',
    subtitle: '十八相送 · 化蝶双飞',
    tone: ['生', '旦'],
    chars: ['梁山伯', '祝英台'],
    bg: 'assets/stories/梁祝.jpg',
    intro:
      '同窗三载，十八相送，情愫暗生却终难启齿。楼台一别成永诀，祝英台以死相随，二人化作双蝶，翩然于花间。皮影以两片薄影的若即若离，在灯与幕之间，演尽人间最婉转的相望。',
    notes: ['双影并行 · 若即若离', '化蝶幻影 · 光影渐隐'],
  },
  {
    id: '鹊桥相会',
    title: '鹊桥相会',
    subtitle: '银汉迢迢 · 一年一聚',
    tone: ['生', '旦'],
    chars: ['牛郎', '织女'],
    bg: 'assets/stories/鹊桥相会.jpg',
    intro:
      '银河横亘，牛郎织女隔岸相望。七夕之夜，喜鹊填桥，一年只得一聚。皮影以银河的镂空灯影与鹊羽的层层叠压，托起这段天上人间的相思，幕上光影流泻，如星如雨。',
    notes: ['银河镂空 · 鹊羽叠影', '隔岸对望 · 双影合璧'],
  },
];

/* 自定义剧目 · 人物与布景（由预处理脚本生成，见 data/rig.json） */
export const CUSTOM_CHARS = [
  { id: 'c01', name: '素纱幽兰', file: 'assets/chars/c01.png' },
  { id: 'c02', name: '赤金剑客', file: 'assets/chars/c02.png' },
  { id: 'c03', name: '玄羽枪师', file: 'assets/chars/c03.png' },
  { id: 'c04', name: '绯衣持杖', file: 'assets/chars/c04.png' },
  { id: 'c05', name: '白发剑修', file: 'assets/chars/c05.png' },
  { id: 'c06', name: '赤发女侠', file: 'assets/chars/c06.png' },
  { id: 'c07', name: '墨蝶公子', file: 'assets/chars/c07.png' },
  { id: 'c08', name: '霜蓝剑士', file: 'assets/chars/c08.png' },
  { id: 'c09', name: '金铃少女', file: 'assets/chars/c09.png' },
  { id: 'c10', name: '幽蓝战将', file: 'assets/chars/c10.png' },
];

export const CUSTOM_BGS = [
  { id: 'b01', name: '云野长天', file: 'assets/bgs/b01.jpg' },
  { id: 'b02', name: '雪山寒湖', file: 'assets/bgs/b02.jpg' },
  { id: 'b03', name: '松石留白', file: 'assets/bgs/b03.jpg' },
  { id: 'b04', name: '朱幕深宫', file: 'assets/bgs/b04.jpg' },
  { id: 'b05', name: '朱栏宣纸', file: 'assets/bgs/b05.jpg' },
  { id: 'b06', name: '远山一角', file: 'assets/bgs/b06.jpg' },
  { id: 'b07', name: '苍崖一角', file: 'assets/bgs/b07.jpg' },
  { id: 'b08', name: '云山卷轴', file: 'assets/bgs/b08.jpg' },
  { id: 'b09', name: '戏台红幕', file: 'assets/bgs/b09.jpg' },
  { id: 'b10', name: '青岩宣纸', file: 'assets/bgs/b10.jpg' },
];
