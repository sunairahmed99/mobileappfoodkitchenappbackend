import Blog from '../Models/Blog.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../Config/cloudinary.js';
import { handleControllerError } from '../Utils/errorResponse.js';

const serializeBlog = (blog) => ({
  id: String(blog._id),
  orderNumber: blog.title || '',
  title: blog.title || '',
  customerName: blog.customerName || 'Valued Customer',
  destinationArea: blog.destinationArea || 'Lahore',
  itemsDescription: blog.itemsDescription || '',
  category: blog.category || 'Fresh Cooked',
  photoUrl: blog.photoUrl || '',
  cloudinaryId: blog.cloudinaryId || null,
  dispatchedAt: blog.dispatchedAt || new Date(blog.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  riderName: blog.riderName || 'Kitchen Dispatch Team',
  status: blog.status || 'Out for Delivery',
  sealVerified: blog.sealVerified !== false,
  likes: Number(blog.likes) || 0,
  isPublished: blog.isPublished !== false,
  createdAt: blog.createdAt ? new Date(blog.createdAt).toISOString() : new Date().toISOString(),
});

/**
 * @desc    Get all blogs / dispatches (public & admin)
 * @route   GET /api/blogs
 * @access  Public
 */
export const getAllBlogs = async (req, res) => {
  try {
    const { category, search, all } = req.query;
    const filter = {};

    // By default, public only sees published blogs unless `all=true` passed by admin
    if (all !== 'true') {
      filter.isPublished = true;
    }

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (search) {
      const pattern = String(search).trim();
      if (pattern) {
        filter.$or = [
          { title: { $regex: pattern, $options: 'i' } },
          { customerName: { $regex: pattern, $options: 'i' } },
          { destinationArea: { $regex: pattern, $options: 'i' } },
          { itemsDescription: { $regex: pattern, $options: 'i' } },
          { riderName: { $regex: pattern, $options: 'i' } },
        ];
      }
    }

    const blogs = await Blog.find(filter).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      count: blogs.length,
      data: blogs.map(serializeBlog),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching blogs');
  }
};

/**
 * @desc    Get single blog by ID
 * @route   GET /api/blogs/:id
 * @access  Public
 */
export const getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).lean();
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    res.json({ success: true, data: serializeBlog(blog) });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while fetching blog details');
  }
};

/**
 * @desc    Create new blog / dispatch item
 * @route   POST /api/blogs
 * @access  Private/Admin
 */
export const createBlog = async (req, res) => {
  try {
    const {
      title,
      orderNumber,
      customerName,
      destinationArea,
      itemsDescription,
      category,
      dispatchedAt,
      riderName,
      status,
      sealVerified,
      likes,
      isPublished,
    } = req.body;

    let photoUrl = req.body.photoUrl || req.body.imageUrl;
    let cloudinaryId = null;

    if (req.file) {
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        'homefoods/blogs',
        req.file.originalname,
        req.file.mimetype
      );
      photoUrl = uploadResult.secure_url;
      cloudinaryId = uploadResult.public_id;
    }

    if (!photoUrl) {
      return res.status(400).json({
        success: false,
        message: 'Blog photo is required (upload image or provide photoUrl)',
      });
    }

    const blogTitle = (title || orderNumber || '').trim();
    if (!blogTitle) {
      return res.status(400).json({
        success: false,
        message: 'Title or Order Number is required',
      });
    }

    const desc = (itemsDescription || req.body.description || '').trim();
    if (!desc) {
      return res.status(400).json({
        success: false,
        message: 'Description or items detail is required',
      });
    }

    const blog = await Blog.create({
      title: blogTitle,
      customerName: (customerName || 'Valued Customer').trim(),
      destinationArea: (destinationArea || 'Lahore').trim(),
      itemsDescription: desc,
      category: category || 'Fresh Cooked',
      photoUrl,
      cloudinaryId,
      dispatchedAt: dispatchedAt || `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      riderName: (riderName || 'Kitchen Dispatch Team').trim(),
      status: status || 'Out for Delivery',
      sealVerified: sealVerified !== undefined ? sealVerified === true || sealVerified === 'true' : true,
      likes: likes ? Number(likes) : 0,
      isPublished: isPublished !== undefined ? isPublished === true || isPublished === 'true' : true,
    });

    res.status(201).json({
      success: true,
      message: 'Blog / Dispatch posted successfully',
      data: serializeBlog(blog),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while creating blog post');
  }
};

/**
 * @desc    Update blog / dispatch item
 * @route   PUT /api/blogs/:id
 * @access  Private/Admin
 */
export const updateBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    const {
      title,
      orderNumber,
      customerName,
      destinationArea,
      itemsDescription,
      category,
      dispatchedAt,
      riderName,
      status,
      sealVerified,
      likes,
      isPublished,
    } = req.body;

    if (title || orderNumber) blog.title = (title || orderNumber).trim();
    if (customerName !== undefined) blog.customerName = customerName.trim();
    if (destinationArea !== undefined) blog.destinationArea = destinationArea.trim();
    if (itemsDescription !== undefined) blog.itemsDescription = itemsDescription.trim();
    if (category !== undefined) blog.category = category;
    if (dispatchedAt !== undefined) blog.dispatchedAt = dispatchedAt.trim();
    if (riderName !== undefined) blog.riderName = riderName.trim();
    if (status !== undefined) blog.status = status;
    if (sealVerified !== undefined) blog.sealVerified = sealVerified === true || sealVerified === 'true';
    if (likes !== undefined) blog.likes = Number(likes);
    if (isPublished !== undefined) blog.isPublished = isPublished === true || isPublished === 'true';

    if (req.file) {
      if (blog.cloudinaryId) {
        await deleteFromCloudinary(blog.cloudinaryId);
      }
      const uploadResult = await uploadToCloudinary(
        req.file.buffer,
        'homefoods/blogs',
        req.file.originalname,
        req.file.mimetype
      );
      blog.photoUrl = uploadResult.secure_url;
      blog.cloudinaryId = uploadResult.public_id;
    } else if (req.body.photoUrl || req.body.imageUrl) {
      blog.photoUrl = req.body.photoUrl || req.body.imageUrl;
    }

    await blog.save();

    res.json({
      success: true,
      message: 'Blog post updated successfully',
      data: serializeBlog(blog),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while updating blog post');
  }
};

/**
 * @desc    Delete blog post
 * @route   DELETE /api/blogs/:id
 * @access  Private/Admin
 */
export const deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    if (blog.cloudinaryId) {
      await deleteFromCloudinary(blog.cloudinaryId);
    }

    await blog.deleteOne();

    res.json({ success: true, message: 'Blog post deleted successfully' });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while deleting blog post');
  }
};

/**
 * @desc    Toggle blog publish status
 * @route   PATCH /api/blogs/:id/status
 * @access  Private/Admin
 */
export const toggleBlogStatus = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    blog.isPublished = !blog.isPublished;
    await blog.save();

    res.json({
      success: true,
      message: blog.isPublished ? 'Blog published to storefront' : 'Blog unpublished and hidden',
      data: serializeBlog(blog),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while updating blog status');
  }
};

/**
 * @desc    Like a blog post
 * @route   PATCH /api/blogs/:id/like
 * @access  Public
 */
export const likeBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }

    const { delta = 1 } = req.body || {};
    blog.likes = Math.max(0, (blog.likes || 0) + Number(delta));
    await blog.save();

    res.json({
      success: true,
      likes: blog.likes,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Server error while updating likes');
  }
};
