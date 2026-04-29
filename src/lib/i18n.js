// Internationalization — Chinese labels for operator/sales roles.
// Admin and customer see English (default). Call t(key) to translate.

const zh = {
  // Sidebar
  "Containers": "柜子",
  "New Container": "新建柜子",
  "No containers found": "暂无柜子",
  "Container No": "柜号",
  "Container Info": "柜子信息",
  "Seal No": "铅封号",
  "Type": "类型",
  "Add Item": "添加明细",
  "Add Loading Item": "添加装柜明细",
  "Loading Items": "装柜明细",
  "暂无装柜明细": "暂无装柜明细",
  "新增行": "新增行",
  "件数": "件数",
  "包装": "包装",
  "毛重 KGS": "毛重 KGS",
  "体积 CBM": "体积 CBM",
  "唛头": "唛头",
  "柜号": "柜号",
  "箱型": "箱型",
  "从货件选择": "从货件选择",
  "手动输入": "手动输入",
  "搜索 PO / Customer PO / 品名...": "搜索 PO / Customer PO / 品名...",
  "Summary": "汇总",
  "备注（短出/剩余空间等）": "备注（短出/剩余空间等）",
  "Back": "返回",
  "每页": "每页",
  "第": "第",
  "页": "页",
  "Shipments": "货件",
  "Audit Log": "操作日志",
  "Customers": "客户",
  "Knowledge": "知识库",
  "Suppliers": "委托方",
  "Manage": "管理",

  // Column headers
  "PO#": "PO#",
  "Cust PO#": "客户PO#",
  "TUC / Description": "品名",
  "SKU": "SKU",
  "Supplier": "委托方",
  "Customer": "客户",
  "End Customer": "终端客户",
  "Route": "航线",
  "Carrier": "船司",
  "Booking": "订舱号",
  "Cntr No": "柜号",
  "Cntr Qty": "柜量",
  "Vessel": "船名",
  "ETD": "ETD",
  "ETA": "ETA",
  "Weight (kg)": "重量(kg)",
  "Volume (m³)": "体积(m³)",
  "Packages": "件数",
  "Incoterms": "贸易条款",
  "QC": "质检",
  "Space": "舱位",
  "Pay": "付款",
  "Telex": "电放",
  "B/L": "提单",
  "Entry": "录单",

  // Field labels (detail page)
  "QC Status": "质检状态",
  "Space Status": "舱位状态",
  "Local Payment": "本地付款",
  "Telex Release": "电放",
  "Incoterms": "贸易条款",
  "CRD Date": "CRD日期",
  "Customer PO#": "客户PO#",
  "Supplier Order No#": "委托方订单号",
  "Description (TUC)": "品名",
  "SKU": "SKU",
  "QTY (Packages)": "件数",
  "Weight (kg)": "重量(kg)",
  "Volume (m³)": "体积(m³)",
  "E-Booking No": "电子订舱号",
  "Booking No": "订舱号",
  "POL": "起运港",
  "POD": "目的港",
  "Carrier": "船司",
  "QTY (Container)": "柜量",
  "ETA": "ETA",
  "ETD": "ETD",
  "Vessel": "船名",
  "Agent": "代理",
  "Container No": "柜号",
  "B/L Status": "提单状态",
  "Entry Status": "录单状态",
  "Entry Number": "系统编号",

  // Buttons & UI
  "未设置": "未设置",
  "Import": "导入",
  "条": "条",
  "已选": "已选",
  "选择要修改的字段": "选择要修改的字段",
  "状态字段": "状态字段",
  "其他字段": "其他字段",
  "选择值": "选择值",
  "应用到": "应用到",
  "Duplicate": "复制",
  "New Shipment": "新建货件",
  "Export CSV": "导出CSV",
  "Columns": "列设置",
  "Filters": "筛选",
  "Search...": "搜索...",
  "Save": "保存",
  "Cancel": "取消",
  "Edit": "编辑",
  "Delete": "删除",
  "Close": "关闭",
  "Loading...": "加载中...",
  "No shipments found": "暂无货件",
  "Details": "详情",
  "Notes": "备注",
  "Overview": "概览",
  "Follow-ups": "跟进",
  "Quotes": "报价",
  "Back to customers": "← 返回客户列表",
  "Back to shipments": "← 返回列表",
  "Order References": "订单信息",
  "Parties": "相关方",
  "Cargo Details": "货物详情",
  "Shipping Details": "航运详情",
  "Loading Details": "装柜详情",
  "Manage Loading": "管理装柜",
  "Click to manage loading records.": "点击管理装柜记录。",
  "委托方列表": "委托方列表",
  "选择一个委托方查看详情": "选择一个委托方查看详情",
  "Notes attached to customers, suppliers, and shipments": "附属于客户、委托方和货件的备注",
  "Select an item to view notes": "选择一个项目查看备注",
  "No items found": "暂无数据",
  "已录单": "已录单",
  "未录单": "未录单",
  "系统编号": "系统编号",

  // Manage page
  "Users & Roles": "用户与角色",
  "Sales Assignments": "销售分配",
  "Pipeline Stages": "管道阶段",
  "End Customers": "终端客户",
  "Ports": "港口",
  "Carriers & Agents": "船司与代理",

  // Stats
  "Total": "总计",
  "QC Pending": "质检待定",
  "Payment Due": "待付款",
  "Telex Pending": "待电放",
  "B/L Pending": "待签单",
  "Entry Pending": "待录单",
  "Overview": "概览",
};

let _role = "admin"; // default English
let _supplierCnMap = {}; // english name → chinese name

export function setI18nRole(role) {
  _role = role;
}

export function setSupplierCnMap(map) {
  _supplierCnMap = map || {};
}

export function t(key) {
  if (_role === "operator" || _role === "sales") {
    return zh[key] || key;
  }
  return key;
}

// Translate supplier name: show chinese if available for operator/sales
export function tSupplier(name) {
  if (!name) return null;
  if (_role === "operator" || _role === "sales") {
    return _supplierCnMap[name] || name;
  }
  return name;
}

// For use in non-reactive contexts (e.g. column definitions)
export function isZh() {
  return _role === "operator" || _role === "sales";
}
